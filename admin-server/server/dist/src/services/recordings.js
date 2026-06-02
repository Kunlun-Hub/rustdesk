import fs from 'node:fs/promises';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
function toBigIntBytes(gb) {
    return BigInt(Math.floor(gb * 1024 * 1024 * 1024));
}
async function unlinkIfPresent(path) {
    if (!path)
        return { fileState: 'not_configured' };
    try {
        await fs.unlink(path);
        return { fileState: 'deleted' };
    }
    catch (error) {
        const fsError = error;
        if (fsError.code === 'ENOENT') {
            return { fileState: 'missing' };
        }
        return { fileState: 'failed', errorCode: fsError.code ?? 'UNKNOWN' };
    }
}
function countFileStates(results) {
    return results.reduce((summary, result) => {
        summary[result.fileState] += 1;
        return summary;
    }, { deleted: 0, missing: 0, not_configured: 0, failed: 0 });
}
function successfulRemoval(result) {
    return result.fileState !== 'failed';
}
async function removeRecordingFiles(recordings) {
    const results = await Promise.all(recordings.map(async (recording) => ({
        id: recording.id,
        ...(await unlinkIfPresent(recording.path))
    })));
    return {
        results,
        succeededIds: results.filter(successfulRemoval).map((result) => result.id),
        failed: results
            .filter((result) => result.fileState === 'failed')
            .map((result) => ({ id: result.id, errorCode: result.errorCode ?? 'UNKNOWN' })),
        fileStates: countFileStates(results)
    };
}
export async function applyRecordingRetention(options = {}) {
    const dryRun = options.dryRun ?? false;
    const retentionDays = options.retentionDays ?? config.RECORDING_RETENTION_DAYS;
    const maxTotalBytes = toBigIntBytes(options.maxTotalGb ?? config.RECORDING_RETENTION_MAX_GB);
    const cutoff = retentionDays > 0 ? new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000) : null;
    const recordings = await prisma.recording.findMany({
        where: { status: { not: 'REMOVED' } },
        orderBy: { startedAt: 'asc' }
    });
    const byAge = cutoff ? recordings.filter((recording) => recording.startedAt < cutoff) : [];
    const ageIds = new Set(byAge.map((recording) => recording.id));
    let remainingSize = recordings
        .filter((recording) => !ageIds.has(recording.id))
        .reduce((total, recording) => total + recording.sizeBytes, 0n);
    const byCapacity = [];
    if (maxTotalBytes > 0n) {
        for (const recording of recordings) {
            if (remainingSize <= maxTotalBytes)
                break;
            if (ageIds.has(recording.id))
                continue;
            byCapacity.push(recording);
            remainingSize -= recording.sizeBytes;
        }
    }
    const selected = [...byAge, ...byCapacity];
    const selectedIds = new Set(selected.map((recording) => recording.id));
    const candidateBytes = selected.reduce((total, recording) => total + recording.sizeBytes, 0n);
    let removal = {
        results: [],
        succeededIds: [],
        failed: [],
        fileStates: { deleted: 0, missing: 0, not_configured: 0, failed: 0 }
    };
    if (!dryRun && selectedIds.size > 0) {
        removal = await removeRecordingFiles(selected);
        if (removal.succeededIds.length > 0) {
            await prisma.recording.updateMany({
                where: { id: { in: removal.succeededIds } },
                data: { status: 'REMOVED' }
            });
        }
    }
    const failedIds = new Set(removal.failed.map((failure) => failure.id));
    const reclaimedBytes = dryRun
        ? candidateBytes
        : selected
            .filter((recording) => !failedIds.has(recording.id))
            .reduce((total, recording) => total + recording.sizeBytes, 0n);
    const retainedBytesAfterFailure = dryRun
        ? 0n
        : selected
            .filter((recording) => failedIds.has(recording.id))
            .reduce((total, recording) => total + recording.sizeBytes, 0n);
    return {
        dryRun,
        retentionDays,
        maxTotalGb: options.maxTotalGb ?? config.RECORDING_RETENTION_MAX_GB,
        totalRecordings: recordings.length,
        removed: dryRun ? selectedIds.size : removal.succeededIds.length,
        failed: dryRun ? 0 : removal.failed.length,
        candidateBytes: candidateBytes.toString(),
        reclaimedBytes: reclaimedBytes.toString(),
        retainedBytesAfterFailure: retainedBytesAfterFailure.toString(),
        fileStates: dryRun
            ? { deleted: 0, missing: 0, not_configured: 0, failed: 0 }
            : removal.fileStates,
        failures: dryRun ? [] : removal.failed,
        byAge: byAge.length,
        byCapacity: byCapacity.length,
        candidates: selected.map((recording) => ({
            id: recording.id,
            filename: recording.filename,
            sizeBytes: recording.sizeBytes.toString(),
            startedAt: recording.startedAt
        }))
    };
}

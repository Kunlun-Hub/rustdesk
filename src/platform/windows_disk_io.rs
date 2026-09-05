use std::{
    ptr::null_mut,
    sync::{Mutex, OnceLock},
};
use winapi::{
    shared::minwindef::DWORD,
    um::pdh::{
        PdhAddEnglishCounterA, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterValue,
        PdhOpenQueryA, PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
    },
};

struct DiskIoQuery {
    query: PDH_HQUERY,
    read: PDH_HCOUNTER,
    write: PDH_HCOUNTER,
}

unsafe impl Send for DiskIoQuery {}

impl Drop for DiskIoQuery {
    fn drop(&mut self) {
        unsafe { PdhCloseQuery(self.query) };
    }
}

impl DiskIoQuery {
    unsafe fn new() -> Option<Self> {
        let mut query = null_mut();
        if PdhOpenQueryA(null_mut(), 0, &mut query) != 0 {
            return None;
        }
        let mut value = Self {
            query,
            read: null_mut(),
            write: null_mut(),
        };
        if PdhAddEnglishCounterA(
            query,
            b"\\PhysicalDisk(_Total)\\Disk Read Bytes/sec\0".as_ptr() as _,
            0,
            &mut value.read,
        ) != 0
            || PdhAddEnglishCounterA(
                query,
                b"\\PhysicalDisk(_Total)\\Disk Write Bytes/sec\0".as_ptr() as _,
                0,
                &mut value.write,
            ) != 0
            || PdhCollectQueryData(query) != 0
        {
            return None;
        }
        Some(value)
    }

    unsafe fn sample(&self) -> Option<(u64, u64)> {
        if PdhCollectQueryData(self.query) != 0 {
            return None;
        }
        Some((counter_value(self.read)?, counter_value(self.write)?))
    }
}

unsafe fn counter_value(counter: PDH_HCOUNTER) -> Option<u64> {
    let mut counter_type: DWORD = 0;
    let mut value: PDH_FMT_COUNTERVALUE = std::mem::zeroed();
    if PdhGetFormattedCounterValue(counter, PDH_FMT_DOUBLE, &mut counter_type, &mut value) != 0
        || value.CStatus > 1
    {
        return None;
    }
    let bytes = value.u.doubleValue().clone();
    Some(if bytes.is_finite() && bytes > 0.0 {
        bytes as u64
    } else {
        0
    })
}

pub(crate) fn disk_io_bps() -> (u64, u64) {
    static QUERY: OnceLock<Mutex<Option<DiskIoQuery>>> = OnceLock::new();
    let mut query = QUERY
        .get_or_init(|| Mutex::new(unsafe { DiskIoQuery::new() }))
        .lock()
        .unwrap();
    if query.is_none() {
        *query = unsafe { DiskIoQuery::new() };
        return (0, 0);
    }
    if let Some(sample) = unsafe { query.as_ref().and_then(|value| value.sample()) } {
        sample
    } else {
        *query = None;
        (0, 0)
    }
}

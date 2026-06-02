import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  ConfigProvider,
  DatePicker,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import { Activity, BookOpen, ClipboardList, KeyRound, Monitor, Radio, ShieldCheck, Users, Video } from 'lucide-react';
import dayjs from 'dayjs';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:21114';

type Locale = 'zh' | 'en';

const messages: Record<Locale, Record<string, string>> = {
  zh: {
    'app.name': 'RustDesk 管理台',
    'nav.devices': '设备',
    'nav.groups': '分组',
    'nav.users': '用户',
    'nav.roles': '角色',
    'nav.strategies': '策略',
    'nav.addressBooks': '地址簿',
    'nav.connections': '连接记录',
    'nav.recordings': '录像',
    'nav.policyReceipts': '策略回执',
    'nav.auditLogs': '审计',
    'nav.systemHealth': '系统健康',
    'nav.identityProviders': '登录提供方',
    'action.exportCsv': '导出 CSV',
    'action.create': '新建',
    'action.upload': '上传',
    'action.retention': '保留策略',
    'action.staleSweep': '清理僵尸连接',
    'action.verifyAudit': '验证审计链',
    'action.changePassword': '修改密码',
    'action.signOut': '退出登录',
    'action.reset': '重置',
    'action.apply': '应用',
    'action.markStaleOffline': '标记超时离线',
    'common.search': '搜索',
    'common.status': '状态',
    'common.group': '分组',
    'common.selected': '已选择',
    'bulk.setGroup': '设置分组',
    'bulk.setStatus': '设置状态',
    'bulk.assignPolicy': '分配策略',
    'stat.devices': '设备',
    'stat.recordings': '录像',
    'stat.auditEvents': '审计事件',
    'resource.devices': '设备',
    'resource.groups': '分组',
    'resource.users': '用户',
    'resource.roles': '角色',
    'resource.strategies': '策略',
    'resource.addressBooks': '地址簿',
    'resource.connections': '连接记录',
    'resource.recordings': '录像',
    'resource.policyReceipts': '策略回执',
    'resource.auditLogs': '审计日志',
    'resource.systemHealth': '系统健康',
    'resource.identityProviders': '登录提供方',
    'table.rustdeskId': 'RustDesk ID',
    'table.hostname': '主机名',
    'table.user': '用户',
    'table.platform': '平台',
    'table.status': '状态',
    'table.group': '分组',
    'table.clientToken': '客户端令牌',
    'table.lastSeen': '最后在线',
    'table.actions': '操作',
    'table.device': '设备',
    'table.filename': '文件名',
    'table.size': '大小',
    'table.started': '开始时间',
    'table.completed': '完成时间',
    'table.action': '动作',
    'table.resource': '资源',
    'table.resourceId': '资源 ID',
    'table.actor': '操作者',
    'table.integrity': '完整性',
    'table.time': '时间',
    'table.policy': '策略',
    'table.version': '版本',
    'table.message': '消息',
    'table.applied': '应用时间',
    'table.updated': '更新时间',
    'table.name': '名称',
    'table.type': '类型',
    'table.enabled': '启用',
    'table.ready': '就绪',
    'table.secret': '密钥',
    'table.linkedIdentities': '关联身份',
    'table.missing': '缺失项',
    'table.description': '描述',
    'table.permissions': '权限',
    'table.roles': '角色',
    'table.identities': '外部身份',
    'table.created': '创建时间',
    'table.peer': '对端',
    'table.direction': '方向',
    'table.state': '状态',
    'state.active': '活跃',
    'state.ended': '已结束',
    'state.set': '已设置',
    'state.global': '全局',
    'state.yes': '是',
    'state.no': '否',
    'empty.noPermissionsTitle': '没有控制台权限',
    'empty.noPermissionsText': '请联系管理员分配至少一个读取权限。'
  },
  en: {
    'app.name': 'RustDesk Admin',
    'nav.devices': 'Devices',
    'nav.groups': 'Groups',
    'nav.users': 'Users',
    'nav.roles': 'Roles',
    'nav.strategies': 'Policies',
    'nav.addressBooks': 'Address Books',
    'nav.connections': 'Connections',
    'nav.recordings': 'Recordings',
    'nav.policyReceipts': 'Policy Receipts',
    'nav.auditLogs': 'Audit',
    'nav.systemHealth': 'System Health',
    'nav.identityProviders': 'Login Providers',
    'action.exportCsv': 'Export CSV',
    'action.create': 'Create',
    'action.upload': 'Upload',
    'action.retention': 'Retention',
    'action.staleSweep': 'Stale Sweep',
    'action.verifyAudit': 'Verify Audit Chain',
    'action.changePassword': 'Change Password',
    'action.signOut': 'Sign out',
    'action.reset': 'Reset',
    'action.apply': 'Apply',
    'action.markStaleOffline': 'Mark stale offline',
    'common.search': 'Search',
    'common.status': 'Status',
    'common.group': 'Group',
    'common.selected': 'selected',
    'bulk.setGroup': 'Set group',
    'bulk.setStatus': 'Set status',
    'bulk.assignPolicy': 'Assign policy',
    'stat.devices': 'Devices',
    'stat.recordings': 'Recordings',
    'stat.auditEvents': 'Audit events',
    'resource.devices': 'Device',
    'resource.groups': 'Group',
    'resource.users': 'User',
    'resource.roles': 'Role',
    'resource.strategies': 'Policy',
    'resource.addressBooks': 'Address Book',
    'resource.connections': 'Connection Record',
    'resource.recordings': 'Recording',
    'resource.policyReceipts': 'Policy Receipt',
    'resource.auditLogs': 'Audit Log',
    'resource.systemHealth': 'System Health',
    'resource.identityProviders': 'Login Provider',
    'table.rustdeskId': 'RustDesk ID',
    'table.hostname': 'Hostname',
    'table.user': 'User',
    'table.platform': 'Platform',
    'table.status': 'Status',
    'table.group': 'Group',
    'table.clientToken': 'Client token',
    'table.lastSeen': 'Last seen',
    'table.actions': 'Actions',
    'table.device': 'Device',
    'table.filename': 'Filename',
    'table.size': 'Size',
    'table.started': 'Started',
    'table.completed': 'Completed',
    'table.action': 'Action',
    'table.resource': 'Resource',
    'table.resourceId': 'Resource ID',
    'table.actor': 'Actor',
    'table.integrity': 'Integrity',
    'table.time': 'Time',
    'table.policy': 'Policy',
    'table.version': 'Version',
    'table.message': 'Message',
    'table.applied': 'Applied',
    'table.updated': 'Updated',
    'table.name': 'Name',
    'table.type': 'Type',
    'table.enabled': 'Enabled',
    'table.ready': 'Ready',
    'table.secret': 'Secret',
    'table.linkedIdentities': 'Linked identities',
    'table.missing': 'Missing',
    'table.description': 'Description',
    'table.permissions': 'Permissions',
    'table.roles': 'Roles',
    'table.identities': 'Identities',
    'table.created': 'Created',
    'table.peer': 'Peer',
    'table.direction': 'Direction',
    'table.state': 'State',
    'state.active': 'ACTIVE',
    'state.ended': 'ENDED',
    'state.set': 'SET',
    'state.global': 'GLOBAL',
    'state.yes': 'YES',
    'state.no': 'NO',
    'empty.noPermissionsTitle': 'No console permissions',
    'empty.noPermissionsText': 'Ask an administrator to assign a role with at least one read permission.'
  }
};

const I18nContext = React.createContext({
  locale: 'zh' as Locale,
  setLocale: (_locale: Locale) => {},
  t: (key: string) => messages.zh[key] ?? key
});

function useI18n() {
  return React.useContext(I18nContext);
}

type ResourceKey =
  | 'devices'
  | 'groups'
  | 'users'
  | 'roles'
  | 'strategies'
  | 'addressBooks'
  | 'connections'
  | 'recordings'
  | 'policyReceipts'
  | 'auditLogs'
  | 'systemHealth'
  | 'identityProviders';

type Session = {
  token: string;
  user: { username: string; isAdmin: boolean; permissions: string[]; hasLocalPassword?: boolean };
};

type AnyRecord = Record<string, unknown> & { id?: string };
type Device = AnyRecord & {
  rustdeskId: string;
  hostname?: string;
  username?: string;
  platform?: string;
  online: boolean;
  status: string;
  lastSeenAt?: string;
  group?: { name: string };
};

type SpecialModal =
  | { kind: 'deviceDetails'; record: AnyRecord }
  | { kind: 'groupDetails'; record: AnyRecord }
  | { kind: 'userIdentities'; record: AnyRecord }
  | { kind: 'resetUserPassword'; record: AnyRecord }
  | { kind: 'changeOwnPassword'; record?: AnyRecord }
  | { kind: 'assignPolicy'; record: AnyRecord }
  | { kind: 'addressPeers'; record: AnyRecord }
  | { kind: 'addressShares'; record: AnyRecord }
  | { kind: 'addressTags'; record: AnyRecord }
  | { kind: 'auditDetails'; record: AnyRecord }
  | { kind: 'connectionDetails'; record: AnyRecord }
  | { kind: 'connectionSweep'; record?: AnyRecord }
  | { kind: 'recordingUpload'; record?: AnyRecord }
  | { kind: 'recordingRetention'; record?: AnyRecord }
  | null;

type ReferenceData = {
  devices: AnyRecord[];
  groups: AnyRecord[];
  roles: AnyRecord[];
  permissions: AnyRecord[];
  users: AnyRecord[];
  strategies: AnyRecord[];
};

type ResourceFilters = Record<string, string | undefined>;
type HealthCheckResult = {
  service: string;
  ok: boolean;
  checks: Record<string, unknown>;
  warnings: string[];
  errors: string[];
};
type AuditVerifyResult = {
  ok: boolean;
  checked: number;
  missingHash: number;
  total: number;
  truncated: boolean;
  headHash?: string | null;
  issues: Array<{ id: string; createdAt: string; reason: string }>;
};

const RESOURCE_PERMISSIONS: Record<ResourceKey, { read: string; write?: string }> = {
  devices: { read: 'devices.read', write: 'devices.write' },
  groups: { read: 'groups.read', write: 'groups.write' },
  users: { read: 'users.read', write: 'users.write' },
  roles: { read: 'roles.read', write: 'roles.write' },
  strategies: { read: 'strategies.read', write: 'strategies.write' },
  addressBooks: { read: 'addressBooks.read', write: 'addressBooks.write' },
  connections: { read: 'connections.read', write: 'connections.write' },
  recordings: { read: 'recordings.read', write: 'recordings.write' },
  policyReceipts: { read: 'strategies.read' },
  auditLogs: { read: 'audit.read' },
  systemHealth: { read: 'system.read' },
  identityProviders: { read: 'identityProviders.read', write: 'identityProviders.write' }
};

function hasPermission(session: Session, permission?: string) {
  return !permission || session.user.isAdmin || session.user.permissions.includes(permission);
}

function canReadResource(session: Session, resource: ResourceKey) {
  return hasPermission(session, RESOURCE_PERMISSIONS[resource].read);
}

function canWriteResource(session: Session, resource: ResourceKey) {
  return hasPermission(session, RESOURCE_PERMISSIONS[resource].write);
}

function endpointFor(resource: ResourceKey) {
  const map: Record<ResourceKey, string> = {
    devices: '/api/admin/devices',
    groups: '/api/admin/device-groups',
    users: '/api/admin/users',
    roles: '/api/admin/roles',
    strategies: '/api/admin/strategies',
    addressBooks: '/api/admin/address-books',
    connections: '/api/admin/connections',
    recordings: '/api/admin/recordings',
    policyReceipts: '/api/admin/policy-receipts',
    auditLogs: '/api/admin/audit-logs',
    systemHealth: '/api/admin/system/health',
    identityProviders: '/api/admin/identity-providers'
  };
  return map[resource];
}

function withQuery(path: string, filters: ResourceFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function canCreate(session: Session, resource: ResourceKey) {
  return ['devices', 'groups', 'users', 'roles', 'strategies', 'addressBooks', 'identityProviders'].includes(resource) && canWriteResource(session, resource);
}

function canMutate(session: Session, resource: ResourceKey) {
  return ['devices', 'groups', 'users', 'roles', 'strategies', 'addressBooks', 'identityProviders', 'recordings', 'connections'].includes(resource) && canWriteResource(session, resource);
}

function optionLabel(record: AnyRecord, fallback = 'name') {
  return String(record.name ?? record[fallback] ?? record.username ?? record.rustdeskId ?? record.id ?? '-');
}

function formatApiError(body: string) {
  if (!body) return 'Request failed';
  try {
    const parsed = JSON.parse(body) as AnyRecord;
    const message = parsed.error ?? parsed.message;
    const messageText = typeof message === 'object' && message !== null ? JSON.stringify(message) : message;
    const details = Object.entries(parsed)
      .filter(([key, value]) => key !== 'error' && key !== 'message' && (
        (Array.isArray(value) && value.length > 0) ||
        ['string', 'number', 'boolean'].includes(typeof value)
      ))
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.map(String).join(', ') : String(value)}`);
    return [messageText ? String(messageText) : body, ...details].join('; ');
  } catch {
    return body;
  }
}

async function responseError(response: Response, fallback: string) {
  const text = await response.text();
  return formatApiError(text || fallback);
}

async function fetchOrThrow(url: string, init: RequestInit, fallback: string) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await responseError(response, fallback));
  }
  return response;
}

async function downloadBlob(response: Response, filename: string) {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatRetentionSummary(result: AnyRecord, dryRun: boolean) {
  const candidates = (result.candidates as AnyRecord[] | undefined)?.length ?? Number(result.removed ?? 0);
  const removedLabel = dryRun ? 'would remove' : 'removed';
  return [
    `Retention ${dryRun ? 'preview' : 'cleanup'}: ${String(candidates)} candidates`,
    `${removedLabel}: ${String(result.removed ?? 0)}`,
    `failed: ${String(result.failed ?? 0)}`,
    `by age: ${String(result.byAge ?? 0)}`,
    `by capacity: ${String(result.byCapacity ?? 0)}`,
    `reclaimed bytes: ${String(result.reclaimedBytes ?? 0)}`
  ].join(', ');
}

function formatStaleSweepSummary(result: AnyRecord, dryRun: boolean) {
  return [
    `Stale connection ${dryRun ? 'preview' : 'sweep'}: ${String(result.affected ?? 0)} ${dryRun ? 'candidates' : 'ended'}`,
    `threshold: ${String(result.staleAfterMinutes ?? '-')} minutes`
  ].join(', ');
}

function useApi(session: Session | null) {
  return useMemo(() => {
    return async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
          ...init.headers
        }
      });
      if (!response.ok) {
        throw new Error(formatApiError(await response.text()));
      }
      return response.json() as Promise<T>;
    };
  }, [session]);
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<{ id: string; type: string; name: string }[]>([]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get('error');
    if (error) {
      message.error(error);
      url.searchParams.delete('error');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }
    fetch(`${API_BASE}/api/login-options`)
      .then((response) => response.json())
      .then((options) => setProviders([...(options.oidc ?? []), ...(options.wecom ?? []), ...(options.dingtalk ?? [])]))
      .catch(() => setProviders([]));
  }, [message]);

  async function submit(values: { username: string; password: string }) {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (!response.ok) throw new Error('Login failed');
      const session = (await response.json()) as Session;
      localStorage.setItem('rustdesk-admin-session', JSON.stringify(session));
      onLogin(session);
    } catch {
      message.error('Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout className="login-shell">
      <section className="login-panel">
        <Typography.Title level={2}>RustDesk Admin</Typography.Title>
        <Typography.Paragraph>Central console for devices, users, policies, audit logs, and recordings.</Typography.Paragraph>
        <Form layout="vertical" onFinish={submit} initialValues={{ username: 'admin' }}>
          <Form.Item name="username" label="Account" rules={[{ required: true }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Sign in
          </Button>
        </Form>
        {providers.length > 0 && (
          <Space direction="vertical" className="provider-list">
            {providers.map((provider) => (
              <Button key={provider.id} href={externalLoginStartUrl(provider.id)} block>
                Continue with {provider.name}
              </Button>
            ))}
          </Space>
        )}
      </section>
    </Layout>
  );
}

function externalLoginStartUrl(providerId: string) {
  const startUrl = new URL(`/api/auth/${providerId}/start`, API_BASE);
  startUrl.searchParams.set('returnUrl', `${window.location.origin}${window.location.pathname}`);
  return startUrl.href;
}

function CreateResourceModal({ resource, session, open, onClose, onCreated, record, references }: {
  resource: ResourceKey;
  session: Session;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  record?: AnyRecord | null;
  references: ReferenceData;
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (record) {
      form.setFieldsValue(toFormValues(resource, record));
    }
  }, [form, open, record, resource]);

  async function submit(values: AnyRecord) {
    try {
      const payload = normalizePayload(resource, values);
      const path = record?.id ? `${endpointFor(resource)}/${record.id}` : endpointFor(resource);
      await api(path, { method: record?.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      message.success(record?.id ? 'Updated' : 'Created');
      form.resetFields();
      onCreated();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Save failed');
    }
  }

  return (
    <Modal title={`${record?.id ? 'Edit' : 'Create'} ${resourceLabel(resource)}`} open={open} onCancel={onClose} onOk={() => form.submit()} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        {fieldsFor(resource, Boolean(record?.id), references)}
      </Form>
    </Modal>
  );
}

function toFormValues(resource: ResourceKey, record: AnyRecord) {
  const values = { ...record };
  if (resource === 'strategies') {
    values.configOptions = JSON.stringify(record.configOptions ?? {}, null, 2);
    values.extra = JSON.stringify(record.extra ?? {}, null, 2);
  }
  if (resource === 'roles') {
    const permissions = record.permissions as Array<{ permission?: { key?: string } }> | undefined;
    values.permissionKeys = permissions?.map((item) => item.permission?.key).filter(Boolean) ?? [];
  }
  if (resource === 'users') {
    const roles = record.roles as Array<{ role?: { id?: string } }> | undefined;
    values.roleIds = roles?.map((item) => item.role?.id).filter(Boolean) ?? [];
  }
  if (resource === 'recordings') {
    values.startedAt = record.startedAt ? dayjs(String(record.startedAt)) : undefined;
    values.completedAt = record.completedAt ? dayjs(String(record.completedAt)) : null;
    values.metadata = JSON.stringify(record.metadata ?? {}, null, 2);
  }
  return values;
}

function normalizePayload(resource: ResourceKey, values: AnyRecord) {
  const payload = { ...values };
  if (resource === 'strategies') {
    payload.configOptions = parseJson(String(payload.configOptions || '{}'), 'Config JSON');
    payload.extra = parseJson(String(payload.extra || '{}'), 'Extra JSON');
  }
  if (resource === 'roles') {
    payload.permissionKeys = Array.isArray(payload.permissionKeys) ? payload.permissionKeys : splitCsv(String(payload.permissionKeys || ''));
  }
  if (resource === 'users') {
    payload.roleIds = Array.isArray(payload.roleIds) ? payload.roleIds : splitCsv(String(payload.roleIds || ''));
  }
  if (resource === 'recordings') {
    payload.startedAt = dayjs.isDayjs(payload.startedAt) ? payload.startedAt.toISOString() : payload.startedAt;
    payload.completedAt = dayjs.isDayjs(payload.completedAt) ? payload.completedAt.toISOString() : payload.completedAt;
    payload.metadata = parseJson(String(payload.metadata || '{}'), 'Metadata JSON');
  }
  if (resource === 'identityProviders') {
    if (payload.clientSecret === '') delete payload.clientSecret;
    if (payload.appSecret === '') delete payload.appSecret;
    if (payload.type !== 'OIDC') {
      payload.issuerUrl = null;
      payload.clientId = null;
      payload.clientSecret = null;
    }
    if (payload.type !== 'WECOM') {
      payload.corpId = null;
      payload.agentId = null;
    }
    if (payload.type !== 'DINGTALK') {
      payload.appKey = null;
    }
    if (payload.type !== 'WECOM' && payload.type !== 'DINGTALK') {
      payload.appSecret = null;
    }
  }
  return payload;
}

function parseJson(value: string, label = 'JSON') {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function splitCsv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function DownloadLink({ session, recording }: { session: Session; recording: AnyRecord }) {
  const { message } = AntApp.useApp();

  async function download() {
    if (!recording.id) return;
    try {
      const response = await fetchOrThrow(`${API_BASE}/api/admin/recordings/${recording.id}/download`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Download failed');
      await downloadBlob(response, String(recording.filename ?? 'recording'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Download failed');
    }
  }

  return <Button size="small" onClick={download}>Download</Button>;
}

function AuditExportButton({ session, filters }: { session: Session; filters: ResourceFilters }) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}${withQuery('/api/admin/audit-logs/export', filters)}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `audit-logs-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>{t('action.exportCsv')}</Button>;
}

function UserExportButton({ session, filters }: { session: Session; filters: ResourceFilters }) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}${withQuery('/api/admin/users/export', filters)}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `users-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>{t('action.exportCsv')}</Button>;
}

function DeviceExportButton({ session, filters }: { session: Session; filters: ResourceFilters }) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}${withQuery('/api/admin/devices/export', filters)}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `devices-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>{t('action.exportCsv')}</Button>;
}

function GroupExportButton({ session, filters }: { session: Session; filters: ResourceFilters }) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}${withQuery('/api/admin/device-groups/export', filters)}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `device-groups-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>{t('action.exportCsv')}</Button>;
}

function PolicyExportButton({ session, filters }: { session: Session; filters: ResourceFilters }) {
  const { message } = AntApp.useApp();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}${withQuery('/api/admin/strategies/export', filters)}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `policies-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>Export CSV</Button>;
}

function AddressBookExportButton({ session, filters }: { session: Session; filters: ResourceFilters }) {
  const { message } = AntApp.useApp();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}${withQuery('/api/admin/address-books/export', filters)}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `address-books-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>Export CSV</Button>;
}

function RoleExportButton({ session }: { session: Session }) {
  const { message } = AntApp.useApp();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}/api/admin/roles/export`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `roles-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>Export CSV</Button>;
}

function RecordingExportButton({ session, filters }: { session: Session; filters: ResourceFilters }) {
  const { message } = AntApp.useApp();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}${withQuery('/api/admin/recordings/export', filters)}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `recordings-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>Export CSV</Button>;
}

function AuditVerifyButton({ session }: { session: Session }) {
  const { message } = AntApp.useApp();

  async function verify() {
    let result: AuditVerifyResult;
    try {
      const response = await fetchOrThrow(`${API_BASE}/api/admin/audit-logs/verify`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Audit verification failed');
      result = await response.json() as AuditVerifyResult;
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Audit verification failed');
      return;
    }
    if (result.ok) {
      message.success(`Audit chain verified: ${result.checked} entries`);
    } else {
      message.warning(`Audit chain has ${result.issues.length} issue(s)`);
    }
    Modal.info({
      title: 'Audit Chain Verification',
      width: 760,
      content: (
        <Space direction="vertical" className="detail-stack">
          <Tag color={result.ok ? 'green' : 'red'}>{result.ok ? 'VERIFIED' : 'ISSUES FOUND'}</Tag>
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={[
              { key: 'Checked entries', value: result.checked },
              { key: 'Total scanned', value: result.total },
              { key: 'Missing hashes', value: result.missingHash },
              { key: 'Truncated', value: result.truncated ? 'YES' : 'NO' },
              { key: 'Head hash', value: result.headHash ?? '-' }
            ]}
            columns={[
              { title: 'Field', dataIndex: 'key', width: 180 },
              { title: 'Value', render: (_, record) => String((record as AnyRecord).value ?? '-') }
            ]}
          />
          {result.issues.length > 0 && (
            <Table
              size="small"
              rowKey={(record) => String((record as AnyRecord).id)}
              dataSource={result.issues}
              pagination={{ pageSize: 5 }}
              columns={[
                { title: 'ID', dataIndex: 'id' },
                { title: 'Reason', dataIndex: 'reason' },
                { title: 'Time', render: (_, record) => dayjs((record as { createdAt: string }).createdAt).format('YYYY-MM-DD HH:mm:ss') }
              ]}
            />
          )}
        </Space>
      )
    });
  }

  return <Button onClick={verify}>Verify Chain</Button>;
}

function ConnectionExportButton({ session, filters }: { session: Session; filters: ResourceFilters }) {
  const { message } = AntApp.useApp();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}${withQuery('/api/admin/connections/export', filters)}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `connection-records-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>Export CSV</Button>;
}

function PolicyReceiptExportButton({ session, filters }: { session: Session; filters: ResourceFilters }) {
  const { message } = AntApp.useApp();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}${withQuery('/api/admin/policy-receipts/export', filters)}`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `policy-receipts-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>Export CSV</Button>;
}

function IdentityProviderExportButton({ session }: { session: Session }) {
  const { message } = AntApp.useApp();

  async function exportCsv() {
    try {
      const response = await fetchOrThrow(`${API_BASE}/api/admin/identity-providers/export`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }, 'Export failed');
      await downloadBlob(response, `identity-providers-${dayjs().format('YYYY-MM-DD')}.csv`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Export failed');
    }
  }

  return <Button onClick={exportCsv}>Export CSV</Button>;
}

function RecordingUploadModal({ session, open, onClose, onUploaded, devices }: {
  session: Session;
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  devices: AnyRecord[];
}) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setFileList([]);
  }, [form, open]);

  async function submit(values: { deviceId?: string; startedAt?: dayjs.Dayjs; metadata?: string }) {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.error('Select a recording file');
      return;
    }

    const body = new FormData();
    body.append('file', file);
    if (values.deviceId) body.append('deviceId', values.deviceId);
    if (values.startedAt) body.append('startedAt', values.startedAt.toISOString());
    if (values.metadata) body.append('metadata', values.metadata);

    setLoading(true);
    try {
      await fetchOrThrow(`${API_BASE}/api/admin/recordings/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body
      }, 'Upload failed');
      message.success('Recording uploaded');
      onUploaded();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Upload Recording" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={loading} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ metadata: '{}' }}>
        <Form.Item label="File" required>
          <Upload
            beforeUpload={() => false}
            maxCount={1}
            fileList={fileList}
            onChange={(info) => setFileList(info.fileList.slice(-1))}
          >
            <Button>Select file</Button>
          </Upload>
        </Form.Item>
        <Form.Item name="deviceId" label="Device">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={devices.map((device) => ({
              value: String(device.id),
              label: `${String(device.rustdeskId ?? device.id)} ${String(device.hostname ?? '')}`.trim()
            }))}
          />
        </Form.Item>
        <Form.Item name="startedAt" label="Started at">
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="metadata" label="Metadata JSON">
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function fieldsFor(resource: ResourceKey, editing = false, references: ReferenceData) {
  if (resource === 'devices') {
    return (
      <>
        <Form.Item name="rustdeskId" label="RustDesk ID" rules={[{ required: !editing }]}><Input disabled={editing} /></Form.Item>
        <Form.Item name="hostname" label="Hostname"><Input /></Form.Item>
        <Form.Item name="username" label="User"><Input /></Form.Item>
        <Form.Item name="platform" label="Platform"><Input /></Form.Item>
        <Form.Item name="status" label="Status">
          <Select allowClear options={['OFFLINE', 'ONLINE', 'DISABLED'].map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="groupId" label="Group">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={references.groups.map((group) => ({ value: String(group.id), label: optionLabel(group) }))}
          />
        </Form.Item>
      </>
    );
  }
  if (resource === 'groups') {
    return (
      <>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
      </>
    );
  }
  if (resource === 'users') {
    return (
      <>
        <Form.Item name="username" label="Username" rules={[{ required: !editing }]}><Input disabled={editing} /></Form.Item>
        <Form.Item name="email" label="Email"><Input /></Form.Item>
        <Form.Item name="displayName" label="Display name"><Input /></Form.Item>
        <Form.Item name="password" label="Password"><Input.Password /></Form.Item>
        <Form.Item name="status" label="Status" initialValue="NORMAL">
          <Select options={['NORMAL', 'DISABLED', 'UNVERIFIED'].map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="roleIds" label="Roles">
          <Select
            mode="multiple"
            allowClear
            options={references.roles.map((role) => ({ value: String(role.id), label: optionLabel(role) }))}
          />
        </Form.Item>
        <Form.Item name="isAdmin" label="Administrator" valuePropName="checked"><Switch /></Form.Item>
      </>
    );
  }
  if (resource === 'roles') {
    return (
      <>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="Description"><Input /></Form.Item>
        <Form.Item name="permissionKeys" label="Permissions">
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            options={references.permissions.map((permission) => ({ value: String(permission.key), label: String(permission.key) }))}
          />
        </Form.Item>
      </>
    );
  }
  if (resource === 'strategies') {
    return (
      <>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="Description"><Input /></Form.Item>
        <Form.Item name="configOptions" label="Config JSON" initialValue="{}"><Input.TextArea rows={5} /></Form.Item>
        <Form.Item name="extra" label="Extra JSON" initialValue="{}"><Input.TextArea rows={3} /></Form.Item>
      </>
    );
  }
  if (resource === 'addressBooks') {
    return (
      <>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="guid" label="GUID"><Input /></Form.Item>
        <Form.Item name="ownerId" label="Owner">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={references.users.map((user) => ({
              value: String(user.id),
              label: `${String(user.username ?? user.id)} ${String(user.displayName ?? user.email ?? '')}`.trim()
            }))}
          />
        </Form.Item>
        <Form.Item name="shareRule" label="Share rule" initialValue="read">
          <Select options={['read', 'write', 'public'].map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="note" label="Note"><Input.TextArea rows={3} /></Form.Item>
      </>
    );
  }
  if (resource === 'identityProviders') {
    return (
      <>
        <Form.Item name="type" label="Type" rules={[{ required: true }]}>
          <Select options={['OIDC', 'WECOM', 'DINGTALK'].map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item noStyle shouldUpdate={(previous, current) => previous.type !== current.type}>
          {({ getFieldValue }) => {
            const type = getFieldValue('type');
            const secretPlaceholder = editing ? 'Leave blank to keep existing secret' : undefined;
            return (
              <>
                {type === 'OIDC' && (
                  <>
                    <Form.Item name="issuerUrl" label="Issuer URL" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="clientId" label="Client ID" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="clientSecret" label="Client secret"><Input.Password placeholder={secretPlaceholder} /></Form.Item>
                  </>
                )}
                {type === 'WECOM' && (
                  <>
                    <Form.Item name="corpId" label="Corp ID" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="agentId" label="Agent ID" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="appSecret" label="App secret"><Input.Password placeholder={secretPlaceholder} /></Form.Item>
                  </>
                )}
                {type === 'DINGTALK' && (
                  <>
                    <Form.Item name="appKey" label="App key" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="appSecret" label="App secret"><Input.Password placeholder={secretPlaceholder} /></Form.Item>
                  </>
                )}
              </>
            );
          }}
        </Form.Item>
        <Form.Item name="enabled" label="Enabled" valuePropName="checked"><Switch /></Form.Item>
      </>
    );
  }
  if (resource === 'recordings') {
    return (
      <>
        <Form.Item name="filename" label="Filename" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="status" label="Status">
          <Select options={['UPLOADING', 'COMPLETED', 'REMOVED', 'FAILED'].map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="startedAt" label="Started at">
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="completedAt" label="Completed at">
          <DatePicker showTime allowClear style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="metadata" label="Metadata JSON">
          <Input.TextArea rows={5} />
        </Form.Item>
      </>
    );
  }
  return null;
}

function ResourceTable({ resource, session, reloadKey, filters, onEdit, onDeleted, onSpecial, references }: {
  resource: ResourceKey;
  session: Session;
  reloadKey: number;
  filters: ResourceFilters;
  onEdit: (record: AnyRecord) => void;
  onDeleted: () => void;
  onSpecial: (modal: SpecialModal) => void;
  references: ReferenceData;
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkForm] = Form.useForm();

  useEffect(() => {
    setLoading(true);
    api<unknown[]>(withQuery(endpointFor(resource), filters))
      .then(setData)
      .finally(() => setLoading(false));
    setSelectedRowKeys([]);
  }, [api, resource, reloadKey, filters]);

  async function remove(record: AnyRecord, options: { force?: boolean } = {}) {
    if (!record.id) return;
    try {
      const deleteUrl = resource === 'identityProviders' && options.force
        ? `${endpointFor(resource)}/${record.id}?force=true`
        : `${endpointFor(resource)}/${record.id}`;
      await api(deleteUrl, { method: 'DELETE' });
      message.success('Deleted');
      onDeleted();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Delete failed');
    }
  }

  async function bulkDevices(values: { groupId?: string; status?: string; strategyId?: string }) {
    if (selectedRowKeys.length === 0) return;
    const payload = {
      deviceIds: selectedRowKeys.map(String),
      groupId: values.groupId ?? undefined,
      status: values.status ?? undefined,
      strategyId: values.strategyId ?? undefined
    };
    try {
      const result = await api<AnyRecord>('/api/admin/devices/bulk', { method: 'POST', body: JSON.stringify(payload) });
      message.success(`Bulk operation finished: ${String(result.updated ?? 0)} updated, ${String(result.assignments ?? 0)} assignments, skipped disabled: ${String(result.skippedDisabledDevices ?? 0)}`);
      bulkForm.resetFields();
      setSelectedRowKeys([]);
      onDeleted();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Bulk operation failed');
    }
  }

  async function bulkUsers(values: { status?: string; roleIds?: string[] }) {
    if (selectedRowKeys.length === 0) return;
    const payload = {
      userIds: selectedRowKeys.map(String),
      status: values.status ?? undefined,
      roleIds: values.roleIds?.length ? values.roleIds : undefined
    };
    try {
      const result = await api<AnyRecord>('/api/admin/users/bulk', { method: 'POST', body: JSON.stringify(payload) });
      message.success(`Bulk user operation finished: ${String(result.updated ?? 0)} updated, ${String(result.roleAssignments ?? 0)} role assignments`);
      bulkForm.resetFields();
      setSelectedRowKeys([]);
      onDeleted();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Bulk user operation failed');
    }
  }

  async function offlineSweep() {
    try {
      await api('/api/admin/devices/offline-sweep', { method: 'POST', body: JSON.stringify({}) });
      message.success('Offline sweep finished');
      onDeleted();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Offline sweep failed');
    }
  }

  async function rotateDeviceToken(record: AnyRecord) {
    if (!record.id) return;
    try {
      const result = await api<AnyRecord>(`/api/admin/devices/${record.id}/client-token`, { method: 'POST', body: JSON.stringify({}) });
      Modal.info({
        title: 'Device Client Token',
        width: 720,
        content: (
          <Space direction="vertical" className="detail-stack">
            <Typography.Text>This token is shown once. Put it in the client request header as Authorization: Bearer.</Typography.Text>
            <Input.TextArea readOnly rows={3} value={String(result.token ?? '')} />
          </Space>
        )
      });
      onDeleted();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Token rotation failed');
    }
  }

  async function revokeDeviceToken(record: AnyRecord) {
    if (!record.id) return;
    try {
      await api(`/api/admin/devices/${record.id}/client-token`, { method: 'DELETE' });
      message.success('Device token revoked');
      onDeleted();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Token revoke failed');
    }
  }

  async function endConnection(record: AnyRecord) {
    if (!record.id) return;
    try {
      await api(`${endpointFor(resource)}/${record.id}/end`, { method: 'POST', body: JSON.stringify({}) });
      message.success('Connection ended');
      onDeleted();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'End connection failed');
    }
  }

  const actionColumn: ColumnsType<unknown>[number] = {
    title: t('table.actions'),
    fixed: 'right',
    render: (_, record) => {
      const row = record as AnyRecord;
      if (resource === 'recordings') {
        return (
          <Space>
            {canWriteResource(session, 'recordings') && <Button size="small" onClick={() => onEdit(row)}>Edit</Button>}
            <DownloadLink session={session} recording={row} />
            {canWriteResource(session, 'recordings') && (
              <Popconfirm title="Remove this recording?" onConfirm={() => remove(row)}>
                <Button size="small" danger>Remove</Button>
              </Popconfirm>
            )}
          </Space>
        );
      }
      if (resource === 'auditLogs') {
        return <Button size="small" onClick={() => onSpecial({ kind: 'auditDetails', record: row })}>Details</Button>;
      }
      if (resource === 'connections') {
        return (
          <Space>
            <Button size="small" onClick={() => onSpecial({ kind: 'connectionDetails', record: row })}>Details</Button>
            {canWriteResource(session, 'connections') && !row.endedAt && <Button size="small" onClick={() => endConnection(row)}>End</Button>}
            {canWriteResource(session, 'connections') && (
              <Popconfirm title="Delete this connection record?" onConfirm={() => remove(row)}>
                <Button size="small" danger>Delete</Button>
              </Popconfirm>
            )}
          </Space>
        );
      }
      if (resource === 'devices') {
        return (
          <Space>
            {canWriteResource(session, 'devices') && <Button size="small" onClick={() => onEdit(row)}>Edit</Button>}
            <Button size="small" onClick={() => onSpecial({ kind: 'deviceDetails', record: row })}>Details</Button>
            {canWriteResource(session, 'devices') && (
              <Button size="small" onClick={() => rotateDeviceToken(row)}>Token</Button>
            )}
            {canWriteResource(session, 'devices') && Boolean(row.clientTokenConfigured) && (
              <Popconfirm title="Revoke this device token?" onConfirm={() => revokeDeviceToken(row)}>
                <Button size="small">Revoke</Button>
              </Popconfirm>
            )}
            {canWriteResource(session, 'devices') && (
              <Popconfirm title="Delete this record?" onConfirm={() => remove(row)}>
                <Button size="small" danger>Delete</Button>
              </Popconfirm>
            )}
          </Space>
        );
      }
      if (!canMutate(session, resource)) return null;
      return (
        <Space>
          <Button size="small" onClick={() => onEdit(row)}>Edit</Button>
          {resource === 'groups' && canReadResource(session, 'groups') && <Button size="small" onClick={() => onSpecial({ kind: 'groupDetails', record: row })}>Details</Button>}
          {resource === 'users' && canReadResource(session, 'users') && <Button size="small" onClick={() => onSpecial({ kind: 'userIdentities', record: row })}>Identities</Button>}
          {resource === 'users' && canWriteResource(session, 'users') && <Button size="small" onClick={() => onSpecial({ kind: 'resetUserPassword', record: row })}>Password</Button>}
          {resource === 'strategies' && canWriteResource(session, 'strategies') && <Button size="small" onClick={() => onSpecial({ kind: 'assignPolicy', record: row })}>Assign</Button>}
          {resource === 'addressBooks' && canWriteResource(session, 'addressBooks') && <Button size="small" onClick={() => onSpecial({ kind: 'addressPeers', record: row })}>Peers</Button>}
          {resource === 'addressBooks' && canWriteResource(session, 'addressBooks') && <Button size="small" onClick={() => onSpecial({ kind: 'addressTags', record: row })}>Tags</Button>}
          {resource === 'addressBooks' && canWriteResource(session, 'addressBooks') && <Button size="small" onClick={() => onSpecial({ kind: 'addressShares', record: row })}>Shares</Button>}
          {['devices', 'groups', 'users', 'roles', 'strategies', 'addressBooks', 'identityProviders'].includes(resource) && (
            <Popconfirm
              title={resource === 'identityProviders' ? 'Delete this provider?' : 'Delete this record?'}
              onConfirm={() => remove(row)}
            >
              <Button size="small" danger>Delete</Button>
            </Popconfirm>
          )}
          {resource === 'identityProviders' && Number(row.linkedAccounts ?? 0) > 0 && (
            <Popconfirm
              title={`Force delete this provider and ${String(row.linkedAccounts)} linked identit${Number(row.linkedAccounts) === 1 ? 'y' : 'ies'}?`}
              onConfirm={() => remove(row, { force: true })}
            >
              <Button size="small" danger>Force Delete</Button>
            </Popconfirm>
          )}
        </Space>
      );
    }
  };

  const showActions = canMutate(session, resource) || resource === 'devices' || resource === 'auditLogs' || (resource === 'recordings' && hasPermission(session, 'recordings.read'));
  const columns = showActions ? [...columnsFor(resource), actionColumn] : columnsFor(resource);
  const table = (
    <Table
      rowKey={(record) => String((record as AnyRecord).id ?? JSON.stringify(record))}
      dataSource={data}
      columns={columns}
      loading={loading}
      pagination={{ pageSize: 10 }}
      scroll={{ x: true }}
      rowSelection={['devices', 'users'].includes(resource) && canWriteResource(session, resource) ? { selectedRowKeys, onChange: setSelectedRowKeys } : undefined}
    />
  );
  if (resource === 'users' && canWriteResource(session, 'users')) {
    return (
      <>
        <Form form={bulkForm} layout="inline" onFinish={bulkUsers} className="inline-form">
          <Form.Item>
            <Typography.Text>{selectedRowKeys.length} {t('common.selected')}</Typography.Text>
          </Form.Item>
          <Form.Item name="status">
            <Select
              allowClear
              placeholder={t('bulk.setStatus')}
              style={{ width: 150 }}
              options={['NORMAL', 'DISABLED', 'UNVERIFIED'].map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item name="roleIds">
            <Select
              mode="multiple"
              allowClear
              placeholder="Set roles"
              style={{ width: 240 }}
              options={references.roles.map((role) => ({ value: String(role.id), label: optionLabel(role) }))}
            />
          </Form.Item>
          <Button htmlType="submit" disabled={selectedRowKeys.length === 0}>{t('action.apply')}</Button>
        </Form>
        {table}
      </>
    );
  }
  if (resource !== 'devices' || !canWriteResource(session, 'devices')) return table;

  return (
    <>
      <Form form={bulkForm} layout="inline" onFinish={bulkDevices} className="inline-form">
        <Form.Item>
          <Typography.Text>{selectedRowKeys.length} {t('common.selected')}</Typography.Text>
        </Form.Item>
        <Form.Item name="groupId">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('bulk.setGroup')}
            style={{ width: 180 }}
            options={references.groups.map((group) => ({ value: String(group.id), label: optionLabel(group) }))}
          />
        </Form.Item>
        <Form.Item name="status">
          <Select
            allowClear
            placeholder={t('bulk.setStatus')}
            style={{ width: 150 }}
            options={['OFFLINE', 'ONLINE', 'DISABLED'].map((value) => ({ value, label: value }))}
          />
        </Form.Item>
        <Form.Item name="strategyId">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('bulk.assignPolicy')}
            style={{ width: 180 }}
            options={references.strategies.map((strategy) => ({ value: String(strategy.id), label: optionLabel(strategy) }))}
          />
        </Form.Item>
        <Button htmlType="submit" disabled={selectedRowKeys.length === 0}>{t('action.apply')}</Button>
        <Button onClick={offlineSweep}>{t('action.markStaleOffline')}</Button>
      </Form>
      {table}
    </>
  );
}

function columnsFor(resource: ResourceKey): ColumnsType<unknown> {
  const { t } = useI18n();
  const date = (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-');
  const text = (key: string) => (_: unknown, record: unknown) => String((record as AnyRecord)[key] ?? '-');
  const statusTag = (status?: string) => {
    const color = status === 'APPLIED' || status === 'COMPLETED' ? 'green' : status === 'FAILED' ? 'red' : 'default';
    return <Tag color={color}>{status ?? '-'}</Tag>;
  };

  if (resource === 'devices') {
    return [
      { title: t('table.rustdeskId'), dataIndex: 'rustdeskId' },
      { title: t('table.hostname'), dataIndex: 'hostname' },
      { title: t('table.user'), dataIndex: 'username' },
      { title: t('table.platform'), dataIndex: 'platform' },
      { title: t('table.status'), render: (_, record) => <Tag color={(record as Device).online ? 'green' : 'default'}>{(record as Device).online ? 'ONLINE' : String((record as Device).status)}</Tag> },
      { title: t('table.group'), render: (_, record) => (record as Device).group?.name ?? '-' },
      { title: t('table.clientToken'), render: (_, record) => <Tag color={(record as AnyRecord).clientTokenConfigured ? 'green' : 'gold'}>{(record as AnyRecord).clientTokenConfigured ? t('state.set') : t('state.global')}</Tag> },
      { title: t('table.lastSeen'), render: (_, record) => date((record as Device).lastSeenAt) }
    ];
  }

  if (resource === 'recordings') {
    return [
      { title: t('table.filename'), dataIndex: 'filename' },
      { title: t('table.device'), render: (_, record) => ((record as { device?: Device }).device?.rustdeskId ?? '-') },
      { title: t('table.size'), dataIndex: 'sizeBytes' },
      { title: t('table.status'), render: (_, record) => statusTag(String((record as AnyRecord).status ?? '')) },
      { title: t('table.started'), render: (_, record) => date((record as { startedAt?: string }).startedAt) },
      { title: t('table.completed'), render: (_, record) => date((record as { completedAt?: string }).completedAt) }
    ];
  }

  if (resource === 'auditLogs') {
    return [
      { title: t('table.action'), dataIndex: 'action' },
      { title: t('table.resource'), dataIndex: 'resource' },
      { title: t('table.resourceId'), dataIndex: 'resourceId' },
      { title: t('table.actor'), render: (_, record) => ((record as { actor?: { username?: string } }).actor?.username ?? '-') },
      { title: t('table.integrity'), render: (_, record) => <Tag color={(record as AnyRecord).entryHash ? 'green' : 'gold'}>{(record as AnyRecord).entryHash ? 'HASHED' : 'LEGACY'}</Tag> },
      { title: t('table.time'), render: (_, record) => date((record as { createdAt?: string }).createdAt) }
    ];
  }

  if (resource === 'policyReceipts') {
    return [
      { title: 'Device', render: (_, record) => ((record as { device?: Device }).device?.rustdeskId ?? '-') },
      { title: 'Policy', render: (_, record) => String(((record as { strategy?: AnyRecord }).strategy?.name ?? (record as AnyRecord).strategyId ?? '-')) },
      { title: 'Version', dataIndex: 'modifiedAt' },
      { title: 'Status', render: (_, record) => statusTag(String((record as AnyRecord).status ?? '')) },
      { title: 'Message', dataIndex: 'message' },
      { title: 'Applied', render: (_, record) => date((record as { appliedAt?: string }).appliedAt) },
      { title: 'Updated', render: (_, record) => date((record as { updatedAt?: string }).updatedAt) }
    ];
  }

  if (resource === 'identityProviders') {
    return [
      { title: 'Name', dataIndex: 'name' },
      { title: 'Type', dataIndex: 'type' },
      { title: 'Enabled', render: (_, record) => <Tag color={(record as { enabled?: boolean }).enabled ? 'green' : 'default'}>{(record as { enabled?: boolean }).enabled ? 'YES' : 'NO'}</Tag> },
      { title: 'Ready', render: (_, record) => {
        const diagnostics = (record as { diagnostics?: { ready?: boolean; missing?: string[] } }).diagnostics;
        return <Tag color={diagnostics?.ready ? 'green' : 'red'}>{diagnostics?.ready ? 'READY' : 'MISSING'}</Tag>;
      } },
      { title: 'Issuer / Corp / App', render: (_, record) => String((record as AnyRecord).issuerUrl ?? (record as AnyRecord).corpId ?? (record as AnyRecord).appKey ?? '-') },
      { title: 'Start URL', render: (_, record) => String(((record as { diagnostics?: { startUrl?: string } }).diagnostics?.startUrl ?? '-')) },
      { title: 'Callback URL', render: (_, record) => String(((record as { diagnostics?: { callbackUrl?: string } }).diagnostics?.callbackUrl ?? '-')) },
      { title: 'Secret', render: (_, record) => {
        const provider = record as { type?: string; diagnostics?: { secrets?: { clientSecret?: boolean; appSecret?: boolean } } };
        const present = provider.type === 'OIDC' ? provider.diagnostics?.secrets?.clientSecret : provider.diagnostics?.secrets?.appSecret;
        return <Tag color={present ? 'green' : 'gold'}>{present ? 'SET' : 'EMPTY'}</Tag>;
      } },
      { title: 'Linked identities', dataIndex: 'linkedAccounts' },
      { title: 'Missing', render: (_, record) => ((record as { diagnostics?: { missing?: string[] } }).diagnostics?.missing ?? []).join(', ') || '-' }
    ];
  }

  if (resource === 'strategies') {
    return [
      { title: 'Name', dataIndex: 'name' },
      { title: 'Description', dataIndex: 'description' },
      { title: 'Version', dataIndex: 'modifiedAt' },
      { title: 'Assignments', render: (_, record) => String(((record as { assignments?: unknown[] }).assignments ?? []).length) },
      { title: 'Rollout', render: (_, record) => {
        const summary = ((record as { receiptSummary?: Record<string, number> }).receiptSummary ?? {}) as Record<string, number>;
        const total = summary.total ?? 0;
        if (!total) return <Tag>NO RECEIPTS</Tag>;
        return (
          <Space size={4} wrap>
            <Tag color="green">APPLIED {summary.APPLIED ?? 0}</Tag>
            <Tag color="red">FAILED {summary.FAILED ?? 0}</Tag>
            <Tag>PENDING {summary.PENDING ?? 0}</Tag>
            <Tag>TOTAL {total}</Tag>
          </Space>
        );
      } },
      { title: 'Updated', render: (_, record) => date((record as { updatedAt?: string }).updatedAt) }
    ];
  }

  if (resource === 'roles') {
    return [
      { title: 'Name', dataIndex: 'name' },
      { title: 'Description', dataIndex: 'description' },
      { title: 'Permissions', render: (_, record) => String(((record as { permissions?: unknown[] }).permissions ?? []).length) },
      { title: 'Users', render: (_, record) => String(((record as { _count?: { users?: number } })._count?.users ?? 0)) }
    ];
  }

  if (resource === 'groups') {
    return [
      { title: 'Name', dataIndex: 'name' },
      { title: 'Description', dataIndex: 'description' },
      { title: 'Devices', render: (_, record) => String(((record as { _count?: { devices?: number } })._count?.devices ?? 0)) },
      { title: 'Updated', render: (_, record) => date((record as { updatedAt?: string }).updatedAt) }
    ];
  }

  if (resource === 'users') {
    return [
      { title: 'Username', dataIndex: 'username' },
      { title: 'Display name', dataIndex: 'displayName' },
      { title: 'Email', dataIndex: 'email' },
      { title: 'Status', render: (_, record) => {
        const status = String((record as AnyRecord).status ?? '-');
        const color = status === 'NORMAL' ? 'green' : status === 'DISABLED' ? 'red' : 'gold';
        return <Tag color={color}>{status}</Tag>;
      } },
      { title: 'Admin', render: (_, record) => ((record as { isAdmin?: boolean }).isAdmin ? <Tag color="blue">YES</Tag> : '-') },
      { title: 'Roles', render: (_, record) => String(((record as { roles?: unknown[] }).roles ?? []).length) },
      { title: 'Identities', render: (_, record) => String(((record as { _count?: { identities?: number } })._count?.identities ?? 0)) },
      { title: 'Created', render: (_, record) => date((record as { createdAt?: string }).createdAt) }
    ];
  }

  if (resource === 'addressBooks') {
    return [
      { title: 'Name', dataIndex: 'name' },
      { title: 'GUID', dataIndex: 'guid' },
      { title: 'Owner', render: (_, record) => String(((record as { owner?: AnyRecord }).owner?.username ?? '-') ) },
      { title: 'Share rule', dataIndex: 'shareRule' },
      { title: 'Peers', render: (_, record) => String(((record as { _count?: { peers?: number } })._count?.peers ?? (record as { peers?: unknown[] }).peers?.length ?? 0)) },
      { title: 'Tags', render: (_, record) => String(((record as { _count?: { tags?: number } })._count?.tags ?? (record as { tags?: unknown[] }).tags?.length ?? 0)) },
      { title: 'Shares', render: (_, record) => String(((record as { _count?: { shares?: number } })._count?.shares ?? (record as { shares?: unknown[] }).shares?.length ?? 0)) },
      { title: 'Updated', render: (_, record) => date((record as { updatedAt?: string }).updatedAt) }
    ];
  }

  if (resource === 'connections') {
    return [
      { title: 'Device', render: (_, record) => ((record as { device?: Device }).device?.rustdeskId ?? '-') },
      { title: 'Hostname', render: (_, record) => ((record as { device?: Device }).device?.hostname ?? '-') },
      { title: 'Peer', dataIndex: 'peerRustdeskId' },
      { title: 'Direction', dataIndex: 'direction' },
      { title: 'State', render: (_, record) => (record as AnyRecord).endedAt ? <Tag>ENDED</Tag> : <Tag color="green">ACTIVE</Tag> },
      { title: 'Started', render: (_, record) => date((record as { startedAt?: string }).startedAt) },
      { title: 'Ended', render: (_, record) => date((record as { endedAt?: string }).endedAt) }
    ];
  }

  return [
    { title: 'Name', render: (_, record) => text('name')(_, record) },
    { title: 'Description', render: (_, record) => text('description')(_, record) },
    { title: 'Status', render: (_, record) => text('status')(_, record) },
    { title: 'Updated', render: (_, record) => date((record as { updatedAt?: string; createdAt?: string }).updatedAt ?? (record as { createdAt?: string }).createdAt) }
  ];
}

function resourceLabel(resource: ResourceKey) {
  const { t } = useI18n();
  return t(`resource.${resource}`);
}

function FilterBar({ resource, references, filters, onChange }: {
  resource: ResourceKey;
  references: ReferenceData;
  filters: ResourceFilters;
  onChange: (filters: ResourceFilters) => void;
}) {
  const { t } = useI18n();
  const searchable = ['devices', 'groups', 'users', 'strategies', 'addressBooks', 'connections', 'recordings', 'policyReceipts', 'auditLogs'].includes(resource);
  if (!searchable) return null;

  function setValue(key: string, value?: string) {
    onChange({ ...filters, [key]: value || undefined });
  }

  return (
    <Space wrap className="filter-bar">
      <Input.Search
        allowClear
        placeholder={t('common.search')}
        value={filters.q}
        onChange={(event) => setValue('q', event.target.value)}
        onSearch={(value) => setValue('q', value)}
        style={{ width: 240 }}
      />
      {resource === 'devices' && (
        <>
          <Select
            allowClear
            placeholder={t('common.status')}
            value={filters.status}
            style={{ width: 140 }}
            onChange={(value) => setValue('status', value)}
            options={['ONLINE', 'OFFLINE', 'DISABLED'].map((value) => ({ value, label: value }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('common.group')}
            value={filters.groupId}
            style={{ width: 180 }}
            onChange={(value) => setValue('groupId', value)}
            options={references.groups.map((group) => ({ value: String(group.id), label: optionLabel(group) }))}
          />
        </>
      )}
      {resource === 'users' && (
        <>
          <Select
            allowClear
            placeholder="Status"
            value={filters.status}
            style={{ width: 150 }}
            onChange={(value) => setValue('status', value)}
            options={['NORMAL', 'DISABLED', 'UNVERIFIED'].map((value) => ({ value, label: value }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Role"
            value={filters.roleId}
            style={{ width: 220 }}
            onChange={(value) => setValue('roleId', value)}
            options={references.roles.map((role) => ({ value: String(role.id), label: optionLabel(role) }))}
          />
          <Select
            allowClear
            placeholder="Identity"
            value={filters.identity}
            style={{ width: 150 }}
            onChange={(value) => setValue('identity', value)}
            options={[
              { value: 'linked', label: 'Linked' },
              { value: 'none', label: 'None' }
            ]}
          />
        </>
      )}
      {resource === 'strategies' && (
        <>
          <Select
            allowClear
            placeholder="Target"
            value={filters.target}
            style={{ width: 150 }}
            onChange={(value) => setValue('target', value)}
            options={[
              { value: 'device', label: 'Device' },
              { value: 'group', label: 'Group' },
              { value: 'unassigned', label: 'Unassigned' }
            ]}
          />
          <Select
            allowClear
            placeholder="Rollout"
            value={filters.rollout}
            style={{ width: 150 }}
            onChange={(value) => setValue('rollout', value)}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
              { value: 'applied', label: 'Applied' },
              { value: 'noReceipts', label: 'No receipts' }
            ]}
          />
        </>
      )}
      {resource === 'connections' && (
        <>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Device"
            value={filters.deviceId}
            style={{ width: 220 }}
            onChange={(value) => setValue('deviceId', value)}
            options={references.devices.map((device) => ({
              value: String(device.id),
              label: `${String(device.rustdeskId ?? device.id)} ${String(device.hostname ?? '')}`.trim()
            }))}
          />
          <Select
            allowClear
            placeholder="State"
            value={filters.state}
            style={{ width: 140 }}
            onChange={(value) => setValue('state', value)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'ended', label: 'Ended' }
            ]}
          />
          <DatePicker
            showTime
            placeholder="From"
            value={filters.from ? dayjs(filters.from) : undefined}
            onChange={(value) => setValue('from', value?.toISOString())}
            style={{ width: 190 }}
          />
          <DatePicker
            showTime
            placeholder="To"
            value={filters.to ? dayjs(filters.to) : undefined}
            onChange={(value) => setValue('to', value?.toISOString())}
            style={{ width: 190 }}
          />
        </>
      )}
      {resource === 'addressBooks' && (
        <>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Owner"
            value={filters.ownerId}
            style={{ width: 220 }}
            onChange={(value) => setValue('ownerId', value)}
            options={references.users.map((user) => ({
              value: String(user.id),
              label: `${String(user.username ?? user.id)} ${String(user.displayName ?? user.email ?? '')}`.trim()
            }))}
          />
          <Select
            allowClear
            placeholder="Share rule"
            value={filters.shareRule}
            style={{ width: 150 }}
            onChange={(value) => setValue('shareRule', value)}
            options={['read', 'write', 'public'].map((value) => ({ value, label: value }))}
          />
        </>
      )}
      {resource === 'recordings' && (
        <>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Device"
            value={filters.deviceId}
            style={{ width: 220 }}
            onChange={(value) => setValue('deviceId', value)}
            options={references.devices.map((device) => ({
              value: String(device.id),
              label: `${String(device.rustdeskId ?? device.id)} ${String(device.hostname ?? '')}`.trim()
            }))}
          />
          <Select
            allowClear
            placeholder="Status"
            value={filters.status}
            style={{ width: 160 }}
            onChange={(value) => setValue('status', value)}
            options={['UPLOADING', 'COMPLETED', 'REMOVED', 'FAILED'].map((value) => ({ value, label: value }))}
          />
        </>
      )}
      {resource === 'policyReceipts' && (
        <>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Device"
            value={filters.deviceId}
            style={{ width: 220 }}
            onChange={(value) => setValue('deviceId', value)}
            options={references.devices.map((device) => ({
              value: String(device.id),
              label: `${String(device.rustdeskId ?? device.id)} ${String(device.hostname ?? '')}`.trim()
            }))}
          />
          <Select
            allowClear
            placeholder="Status"
            value={filters.status}
            style={{ width: 150 }}
            onChange={(value) => setValue('status', value)}
            options={['PENDING', 'APPLIED', 'FAILED'].map((value) => ({ value, label: value }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Policy"
            value={filters.strategyId}
            style={{ width: 220 }}
            onChange={(value) => setValue('strategyId', value)}
            options={references.strategies.map((strategy) => ({ value: String(strategy.id), label: optionLabel(strategy) }))}
          />
        </>
      )}
      {resource === 'auditLogs' && (
        <>
          <Select
            allowClear
            placeholder="Action"
            value={filters.action}
            style={{ width: 180 }}
            onChange={(value) => setValue('action', value)}
            options={['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'HEARTBEAT', 'SYSINFO', 'STRATEGY_PUSH', 'RECORD_UPLOAD', 'RECORD_DOWNLOAD', 'DISCONNECT', 'POLICY_APPLY', 'AUDIT_EXPORT', 'ADDRESS_BOOK_SYNC'].map((value) => ({ value, label: value }))}
          />
          <Input
            allowClear
            placeholder="Resource"
            value={filters.resource}
            onChange={(event) => setValue('resource', event.target.value)}
            style={{ width: 180 }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Actor"
            value={filters.actorUserId}
            style={{ width: 220 }}
            onChange={(value) => setValue('actorUserId', value)}
            options={references.users.map((user) => ({
              value: String(user.id),
              label: `${String(user.username ?? user.id)} ${String(user.displayName ?? user.email ?? '')}`.trim()
            }))}
          />
          <DatePicker
            showTime
            placeholder="From"
            value={filters.from ? dayjs(filters.from) : undefined}
            onChange={(value) => setValue('from', value?.toISOString())}
            style={{ width: 190 }}
          />
          <DatePicker
            showTime
            placeholder="To"
            value={filters.to ? dayjs(filters.to) : undefined}
            onChange={(value) => setValue('to', value?.toISOString())}
            style={{ width: 190 }}
          />
        </>
      )}
      <Button onClick={() => onChange({})}>{t('action.reset')}</Button>
    </Space>
  );
}

function PolicyPreview({ preview }: { preview: AnyRecord }) {
  const payload = preview.preview as AnyRecord | undefined;
  const targetType = String(preview.targetType ?? '-');
  const devicePreview = targetType === 'device' ? payload : undefined;
  const groupPreview = targetType === 'group' ? payload as { devices?: AnyRecord[]; group?: AnyRecord } | undefined : undefined;
  const policies = (devicePreview?.policies as AnyRecord[] | undefined) ?? [];
  const config = devicePreview?.config ?? {};
  const configSources = (devicePreview?.configSources ?? {}) as Record<string, AnyRecord>;
  const configSourceRows = Object.entries(configSources).map(([key, source]) => ({ key, ...source }));

  if (targetType === 'group') {
    return (
      <Space direction="vertical" className="detail-stack" size={8}>
        <Typography.Title level={5}>Preview: {String(groupPreview?.group?.name ?? 'Group')}</Typography.Title>
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={groupPreview?.devices ?? []}
          pagination={{ pageSize: 5 }}
          expandable={{
            expandedRowRender: (record) => (
              <Space direction="vertical" className="detail-stack">
                <Input.TextArea readOnly rows={6} value={JSON.stringify((record as AnyRecord).config ?? {}, null, 2)} />
                <Table
                  size="small"
                  rowKey="key"
                  pagination={false}
                  dataSource={Object.entries(((record as AnyRecord).configSources ?? {}) as Record<string, AnyRecord>).map(([key, source]) => ({ key, ...source }))}
                  columns={[
                    { title: 'Key', dataIndex: 'key' },
                    { title: 'Policy', dataIndex: 'strategyName' },
                    { title: 'Source', dataIndex: 'source' },
                    { title: 'Version', dataIndex: 'modifiedAt' }
                  ]}
                />
              </Space>
            )
          }}
          columns={[
            { title: 'Device', dataIndex: 'rustdeskId' },
            { title: 'Hostname', dataIndex: 'hostname' },
            { title: 'Status', dataIndex: 'status' },
            { title: 'Version', dataIndex: 'modifiedAt' },
            { title: 'Policies', render: (_, record) => String(((record as { policies?: unknown[] }).policies ?? []).length) },
            { title: 'Hash', dataIndex: 'hash' }
          ]}
        />
      </Space>
    );
  }

  return (
    <Space direction="vertical" className="detail-stack" size={8}>
      <Typography.Title level={5}>Preview: {String((devicePreview?.device as AnyRecord | undefined)?.rustdeskId ?? 'Device')}</Typography.Title>
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={[
          { key: 'Version', value: devicePreview?.modifiedAt },
          { key: 'Hash', value: devicePreview?.hash },
          { key: 'Policy count', value: policies.length }
        ]}
        columns={[
          { title: 'Field', dataIndex: 'key', width: 160 },
          { title: 'Value', render: (_, record) => String((record as AnyRecord).value ?? '-') }
        ]}
      />
      <Table
        size="small"
        rowKey={(record) => String((record as AnyRecord).id)}
        dataSource={policies}
        pagination={false}
        columns={[
          { title: 'Policy', dataIndex: 'name' },
          { title: 'Source', dataIndex: 'source' },
          { title: 'Version', dataIndex: 'modifiedAt' }
        ]}
      />
      <Input.TextArea readOnly rows={8} value={JSON.stringify(config, null, 2)} />
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={configSourceRows}
        columns={[
          { title: 'Config key', dataIndex: 'key' },
          { title: 'Winning policy', dataIndex: 'strategyName' },
          { title: 'Source', dataIndex: 'source' },
          { title: 'Version', dataIndex: 'modifiedAt' }
        ]}
      />
    </Space>
  );
}

function PolicyAssignmentModal({ session, policy, open, onClose, references }: {
  session: Session;
  policy: AnyRecord | null;
  open: boolean;
  onClose: () => void;
  references: ReferenceData;
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [assignments, setAssignments] = useState<AnyRecord[]>([]);
  const [receipts, setReceipts] = useState<AnyRecord[]>([]);
  const [targetType, setTargetType] = useState<'device' | 'group'>('device');
  const [preview, setPreview] = useState<AnyRecord | null>(null);

  function load() {
    if (!policy?.id) return;
    api<AnyRecord[]>(`/api/admin/strategies/${policy.id}/assignments`).then(setAssignments).catch(() => setAssignments([]));
    api<AnyRecord[]>(`/api/admin/strategies/${policy.id}/receipts`).then(setReceipts).catch(() => setReceipts([]));
  }

  useEffect(() => {
    if (open) {
      setPreview(null);
      load();
    }
  }, [open, policy?.id]);

  async function submit(values: { targetType: 'device' | 'group'; targetId: string }) {
    if (!policy?.id) return;
    await api(`/api/admin/strategies/${policy.id}/assignments`, {
      method: 'POST',
      body: JSON.stringify(values.targetType === 'device' ? { deviceId: values.targetId } : { groupId: values.targetId })
    });
    message.success('Assigned');
    form.resetFields();
    load();
  }

  async function remove(assignment: AnyRecord) {
    if (!policy?.id || !assignment.id) return;
    await api(`/api/admin/strategies/${policy.id}/assignments/${assignment.id}`, { method: 'DELETE' });
    message.success('Unassigned');
    load();
  }

  async function repush() {
    if (!policy?.id) return;
    const result = await api<AnyRecord>(`/api/admin/strategies/${policy.id}/repush`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    message.success(`Re-pushed ${String(result.receiptsCreated ?? 0)} receipts for ${String(result.targetableDevices ?? result.targetedDevices ?? 0)} devices; skipped disabled: ${String(result.skippedDisabledDevices ?? 0)}`);
    load();
  }

  async function loadPreview() {
    if (!policy?.id) return;
    const values = form.getFieldsValue() as { targetType?: 'device' | 'group'; targetId?: string };
    const selectedTargetType = values.targetType ?? targetType;
    if (!values.targetId) {
      message.error('Select a preview target');
      return;
    }
    const result = await api<AnyRecord>(withQuery(`/api/admin/strategies/${policy.id}/preview`, {
      targetType: selectedTargetType,
      targetId: values.targetId
    }));
    setPreview(result);
  }

  return (
    <Modal title={`Assignments: ${String(policy?.name ?? '')}`} open={open} onCancel={onClose} footer={null} destroyOnClose width={860}>
      <Form
        form={form}
        layout="inline"
        onFinish={submit}
        className="inline-form"
        initialValues={{ targetType: 'device' }}
        onValuesChange={(changed) => {
          if (changed.targetType) {
            setTargetType(changed.targetType);
            form.setFieldValue('targetId', undefined);
          }
        }}
      >
        <Form.Item name="targetType" rules={[{ required: true }]}>
          <Select style={{ width: 120 }} options={[{ value: 'device', label: 'Device' }, { value: 'group', label: 'Group' }]} />
        </Form.Item>
        <Form.Item name="targetId" rules={[{ required: true }]}>
          <Select
            showSearch
            placeholder={targetType === 'device' ? 'Select device' : 'Select group'}
            optionFilterProp="label"
            style={{ minWidth: 240 }}
            options={(targetType === 'device' ? references.devices : references.groups).map((record) => ({
              value: String(record.id),
              label: targetType === 'device'
                ? `${String(record.rustdeskId ?? record.id)} ${String(record.hostname ?? '')}${record.status === 'DISABLED' ? ' (disabled)' : ''}`.trim()
                : optionLabel(record),
              disabled: targetType === 'device' && record.status === 'DISABLED'
            }))}
          />
        </Form.Item>
        <Button type="primary" htmlType="submit">Assign</Button>
        <Button onClick={loadPreview}>Preview</Button>
        <Button onClick={repush}>Re-push</Button>
      </Form>
      {preview && (
        <PolicyPreview preview={preview} />
      )}
      <Table
        size="small"
        rowKey={(record) => String((record as AnyRecord).id)}
        dataSource={assignments}
        pagination={false}
        columns={[
          {
            title: 'Target',
            render: (_, record) => {
              const row = record as AnyRecord & { device?: AnyRecord; group?: AnyRecord };
              return row.device ? `${String(row.device.rustdeskId ?? row.device.id)} ${String(row.device.hostname ?? '')}`.trim() : optionLabel(row.group ?? row);
            }
          },
          { title: 'Type', render: (_, record) => ((record as AnyRecord).deviceId ? 'Device' : 'Group') },
          { title: 'Action', render: (_, record) => <Button size="small" danger onClick={() => remove(record as AnyRecord)}>Remove</Button> }
        ]}
      />
      <Typography.Title level={5}>Receipts</Typography.Title>
      <Table
        size="small"
        rowKey={(record) => String((record as AnyRecord).id)}
        dataSource={receipts}
        pagination={{ pageSize: 5 }}
        columns={[
          { title: 'Device', render: (_, record) => ((record as { device?: Device }).device?.rustdeskId ?? '-') },
          { title: 'Version', dataIndex: 'modifiedAt' },
          { title: 'Status', render: (_, record) => <Tag color={(record as AnyRecord).status === 'APPLIED' ? 'green' : (record as AnyRecord).status === 'FAILED' ? 'red' : 'default'}>{String((record as AnyRecord).status ?? '-')}</Tag> },
          { title: 'Message', dataIndex: 'message' },
          { title: 'Updated', render: (_, record) => ((record as { updatedAt?: string }).updatedAt ? dayjs((record as { updatedAt?: string }).updatedAt).format('YYYY-MM-DD HH:mm') : '-') }
        ]}
      />
    </Modal>
  );
}

function AddressPeersModal({ session, book, open, onClose }: { session: Session; book: AnyRecord | null; open: boolean; onClose: () => void }) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [peers, setPeers] = useState<AnyRecord[]>([]);
  const [editingPeer, setEditingPeer] = useState<AnyRecord | null>(null);

  function load() {
    if (!book?.id) return;
    api<AnyRecord[]>(`/api/admin/address-books/${book.id}/peers`).then(setPeers).catch(() => setPeers([]));
  }

  useEffect(() => {
    if (!open) return;
    setEditingPeer(null);
    form.resetFields();
    load();
  }, [form, open, book?.id]);

  function edit(peer: AnyRecord) {
    setEditingPeer(peer);
    form.setFieldsValue({
      rustdeskId: peer.rustdeskId,
      alias: peer.alias,
      username: peer.username,
      hostname: peer.hostname,
      platform: peer.platform,
      password: undefined,
      note: peer.note,
      tags: Array.isArray(peer.tags) ? peer.tags.join(', ') : ''
    });
  }

  async function submit(values: AnyRecord) {
    if (!book?.id) return;
    await api(`/api/admin/address-books/${book.id}/peers`, {
      method: 'POST',
      body: JSON.stringify({ ...values, tags: splitCsv(String(values.tags ?? '')) })
    });
    message.success(editingPeer ? 'Peer updated' : 'Peer saved');
    setEditingPeer(null);
    form.resetFields();
    load();
  }

  async function remove(peer: AnyRecord) {
    if (!book?.id || !peer.id) return;
    await api(`/api/admin/address-books/${book.id}/peers/${peer.id}`, { method: 'DELETE' });
    message.success('Peer removed');
    load();
  }

  return (
    <Modal title={`Peers: ${String(book?.name ?? '')}`} open={open} onCancel={onClose} footer={null} destroyOnClose width={980}>
      <Form form={form} layout="vertical" onFinish={submit} className="peer-form">
        <div className="peer-form-grid">
          <Form.Item name="rustdeskId" label="RustDesk ID" rules={[{ required: true }]}>
            <Input disabled={Boolean(editingPeer)} />
          </Form.Item>
          <Form.Item name="alias" label="Alias"><Input /></Form.Item>
          <Form.Item name="username" label="Username"><Input /></Form.Item>
          <Form.Item name="hostname" label="Hostname"><Input /></Form.Item>
          <Form.Item name="platform" label="Platform"><Input /></Form.Item>
          <Form.Item name="password" label="Password"><Input.Password placeholder={editingPeer ? 'Leave blank to keep existing password' : undefined} /></Form.Item>
          <Form.Item name="tags" label="Tags"><Input placeholder="ops, finance" /></Form.Item>
          <Form.Item name="note" label="Note"><Input /></Form.Item>
        </div>
        <Space>
          <Button type="primary" htmlType="submit">{editingPeer ? 'Update peer' : 'Save peer'}</Button>
          {editingPeer && (
            <Button onClick={() => {
              setEditingPeer(null);
              form.resetFields();
            }}>
              Cancel edit
            </Button>
          )}
        </Space>
      </Form>
      <Table
        size="small"
        rowKey={(record) => String((record as AnyRecord).id)}
        dataSource={peers}
        pagination={{ pageSize: 6 }}
        columns={[
          { title: 'RustDesk ID', dataIndex: 'rustdeskId' },
          { title: 'Alias', dataIndex: 'alias' },
          { title: 'User', dataIndex: 'username' },
          { title: 'Hostname', dataIndex: 'hostname' },
          { title: 'Platform', dataIndex: 'platform' },
          { title: 'Password', render: (_, record) => <Tag color={(record as AnyRecord).passwordConfigured ? 'green' : 'default'}>{(record as AnyRecord).passwordConfigured ? 'SET' : 'NONE'}</Tag> },
          { title: 'Tags', render: (_, record) => ((record as { tags?: string[] }).tags ?? []).join(', ') },
          {
            title: 'Action',
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => edit(record as AnyRecord)}>Edit</Button>
                <Button size="small" danger onClick={() => remove(record as AnyRecord)}>Remove</Button>
              </Space>
            )
          }
        ]}
      />
    </Modal>
  );
}

function AddressTagsModal({ session, book, open, onClose }: {
  session: Session;
  book: AnyRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [tags, setTags] = useState<AnyRecord[]>([]);

  function load() {
    if (!book?.id) return;
    api<AnyRecord[]>(`/api/admin/address-books/${book.id}/tags`).then(setTags).catch(() => setTags([]));
  }

  useEffect(() => {
    if (open) load();
  }, [open, book?.id]);

  async function submit(values: { name: string; color?: string }) {
    if (!book?.id) return;
    await api(`/api/admin/address-books/${book.id}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name: values.name, color: values.color || null })
    });
    message.success('Tag saved');
    form.resetFields();
    load();
  }

  async function remove(tag: AnyRecord) {
    if (!book?.id || !tag.id) return;
    await api(`/api/admin/address-books/${book.id}/tags/${tag.id}`, { method: 'DELETE' });
    message.success('Tag removed');
    load();
  }

  return (
    <Modal title={`Tags: ${String(book?.name ?? '')}`} open={open} onCancel={onClose} footer={null} destroyOnClose width={720}>
      <Form form={form} layout="inline" onFinish={submit} className="inline-form">
        <Form.Item name="name" rules={[{ required: true }]}>
          <Input placeholder="Tag name" />
        </Form.Item>
        <Form.Item name="color">
          <Input placeholder="Color" />
        </Form.Item>
        <Button type="primary" htmlType="submit">Save tag</Button>
      </Form>
      <Table
        size="small"
        rowKey={(record) => String((record as AnyRecord).id)}
        dataSource={tags}
        pagination={{ pageSize: 8 }}
        columns={[
          { title: 'Tag', render: (_, record) => <Tag color={String((record as AnyRecord).color ?? '') || undefined}>{String((record as AnyRecord).name ?? '-')}</Tag> },
          { title: 'Color', dataIndex: 'color' },
          { title: 'Action', render: (_, record) => <Button size="small" danger onClick={() => remove(record as AnyRecord)}>Remove</Button> }
        ]}
      />
    </Modal>
  );
}

function DeviceDetailsModal({ session, device, open, onClose }: {
  session: Session;
  device: AnyRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const api = useApi(session);
  const [details, setDetails] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !device?.id) return;
    setLoading(true);
    api<AnyRecord>(`/api/admin/devices/${device.id}`)
      .then(setDetails)
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [api, open, device?.id]);

  const detail = details ?? device;
  const deviceTitle = `${String(detail?.rustdeskId ?? '')} ${String(detail?.hostname ?? '')}`.trim();
  const date = (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-');
  const policyPreview = detail?.policyPreview as AnyRecord | undefined;
  const effectivePolicies = (policyPreview?.policies as AnyRecord[] | undefined) ?? [];

  return (
    <Modal title={`Device Details: ${deviceTitle}`} open={open} onCancel={onClose} footer={null} destroyOnClose width={1040}>
      <Space direction="vertical" size="middle" className="detail-stack">
        <Table
          size="small"
          loading={loading}
          rowKey="key"
          dataSource={[
            { key: 'RustDesk ID', value: detail?.rustdeskId },
            { key: 'Hostname', value: detail?.hostname },
            { key: 'User', value: detail?.username },
            { key: 'Platform', value: detail?.platform },
            { key: 'OS', value: detail?.os },
            { key: 'Version', value: detail?.version },
            { key: 'IP', value: detail?.ipAddress },
            { key: 'Group', value: (detail?.group as AnyRecord | undefined)?.name },
            { key: 'Status', value: detail?.status },
            { key: 'Client token', value: detail?.clientTokenConfigured ? 'Configured' : 'Using global/open client auth' },
            { key: 'Token issued', value: date(detail?.clientTokenIssuedAt as string | undefined) },
            { key: 'Last client auth', value: date(detail?.lastClientAuthAt as string | undefined) },
            { key: 'Last seen', value: date(detail?.lastSeenAt as string | undefined) }
          ]}
          pagination={false}
          columns={[
            { title: 'Field', dataIndex: 'key', width: 180 },
            { title: 'Value', render: (_, record) => String((record as AnyRecord).value ?? '-') }
          ]}
        />
        <Typography.Title level={5}>System Info</Typography.Title>
        <Input.TextArea readOnly rows={6} value={JSON.stringify(detail?.sysinfo ?? {}, null, 2)} />
        <Typography.Title level={5}>Effective Policy</Typography.Title>
        <Table
          size="small"
          rowKey="key"
          dataSource={[
            { key: 'Version', value: policyPreview?.modifiedAt ?? 0 },
            { key: 'Hash', value: policyPreview?.hash ?? '-' },
            { key: 'Policy count', value: effectivePolicies.length }
          ]}
          pagination={false}
          columns={[
            { title: 'Field', dataIndex: 'key', width: 180 },
            { title: 'Value', render: (_, record) => String((record as AnyRecord).value ?? '-') }
          ]}
        />
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={effectivePolicies}
          pagination={false}
          columns={[
            { title: 'Policy', dataIndex: 'name' },
            { title: 'Source', dataIndex: 'source' },
            { title: 'Version', dataIndex: 'modifiedAt' }
          ]}
        />
        <Input.TextArea readOnly rows={6} value={JSON.stringify(policyPreview?.config ?? {}, null, 2)} />
        <Typography.Title level={5}>Recent Heartbeats</Typography.Title>
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={(detail?.heartbeats as AnyRecord[]) ?? []}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: 'Time', render: (_, record) => date((record as { createdAt?: string }).createdAt) },
            { title: 'Connections', render: (_, record) => JSON.stringify((record as AnyRecord).conns ?? '-') }
          ]}
        />
        <Typography.Title level={5}>Recent Connections</Typography.Title>
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={(detail?.connections as AnyRecord[]) ?? []}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: 'Peer', dataIndex: 'peerRustdeskId' },
            { title: 'Direction', dataIndex: 'direction' },
            { title: 'Started', render: (_, record) => date((record as { startedAt?: string }).startedAt) },
            { title: 'Ended', render: (_, record) => date((record as { endedAt?: string }).endedAt) }
          ]}
        />
        <Typography.Title level={5}>Recent Recordings</Typography.Title>
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={(detail?.recordings as AnyRecord[]) ?? []}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: 'Filename', dataIndex: 'filename' },
            { title: 'Status', dataIndex: 'status' },
            { title: 'Size', dataIndex: 'sizeBytes' },
            { title: 'Started', render: (_, record) => date((record as { startedAt?: string }).startedAt) }
          ]}
        />
        <Typography.Title level={5}>Policy Assignments</Typography.Title>
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={(detail?.strategyAssignments as AnyRecord[]) ?? []}
          pagination={false}
          columns={[
            { title: 'Policy', render: (_, record) => String(((record as { strategy?: AnyRecord }).strategy?.name ?? '-') ) },
            { title: 'Assigned', render: (_, record) => date((record as { createdAt?: string }).createdAt) }
          ]}
        />
        <Typography.Title level={5}>Policy Receipts</Typography.Title>
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={(detail?.strategyReceipts as AnyRecord[]) ?? []}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: 'Policy', render: (_, record) => String(((record as { strategy?: AnyRecord }).strategy?.name ?? '-') ) },
            { title: 'Version', dataIndex: 'modifiedAt' },
            { title: 'Status', dataIndex: 'status' },
            { title: 'Message', dataIndex: 'message' },
            { title: 'Updated', render: (_, record) => date((record as { updatedAt?: string }).updatedAt) }
          ]}
        />
      </Space>
    </Modal>
  );
}

function GroupDetailsModal({ session, group, open, onClose }: {
  session: Session;
  group: AnyRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const api = useApi(session);
  const [details, setDetails] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !group?.id) return;
    setLoading(true);
    api<AnyRecord>(`/api/admin/device-groups/${group.id}`)
      .then(setDetails)
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [api, open, group?.id]);

  const detail = details ?? group;
  const date = (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-');

  return (
    <Modal title={`Group Details: ${String(detail?.name ?? '')}`} open={open} onCancel={onClose} footer={null} destroyOnClose width={1040}>
      <Space direction="vertical" size="middle" className="detail-stack">
        <Table
          size="small"
          loading={loading}
          rowKey="key"
          dataSource={[
            { key: 'Name', value: detail?.name },
            { key: 'Description', value: detail?.description },
            { key: 'Devices', value: (detail?._count as { devices?: number } | undefined)?.devices ?? (detail?.devices as unknown[] | undefined)?.length ?? 0 },
            { key: 'Policies', value: (detail?._count as { strategies?: number } | undefined)?.strategies ?? (detail?.strategies as unknown[] | undefined)?.length ?? 0 },
            { key: 'Updated', value: date(detail?.updatedAt as string | undefined) }
          ]}
          pagination={false}
          columns={[
            { title: 'Field', dataIndex: 'key', width: 180 },
            { title: 'Value', render: (_, record) => String((record as AnyRecord).value ?? '-') }
          ]}
        />
        <Typography.Title level={5}>Devices</Typography.Title>
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={(detail?.devices as AnyRecord[]) ?? []}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: 'RustDesk ID', dataIndex: 'rustdeskId' },
            { title: 'Hostname', dataIndex: 'hostname' },
            { title: 'User', dataIndex: 'username' },
            { title: 'Platform', dataIndex: 'platform' },
            { title: 'Status', render: (_, record) => <Tag color={(record as Device).online ? 'green' : 'default'}>{(record as Device).online ? 'ONLINE' : String((record as Device).status ?? '-')}</Tag> },
            { title: 'Last seen', render: (_, record) => date((record as { lastSeenAt?: string }).lastSeenAt) }
          ]}
        />
        <Typography.Title level={5}>Assigned Policies</Typography.Title>
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={(detail?.strategies as AnyRecord[]) ?? []}
          pagination={{ pageSize: 6 }}
          columns={[
            { title: 'Policy', render: (_, record) => String(((record as { strategy?: AnyRecord }).strategy?.name ?? '-') ) },
            { title: 'Version', render: (_, record) => String(((record as { strategy?: AnyRecord }).strategy?.modifiedAt ?? '-') ) },
            { title: 'Assigned', render: (_, record) => date((record as { createdAt?: string }).createdAt) }
          ]}
        />
      </Space>
    </Modal>
  );
}

function UserIdentitiesModal({ session, user, open, onClose }: {
  session: Session;
  user: AnyRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [identities, setIdentities] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(false);

  function load() {
    if (!user?.id) return;
    setLoading(true);
    api<AnyRecord[]>(`/api/admin/users/${user.id}/identities`)
      .then(setIdentities)
      .catch(() => setIdentities([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!open) return;
    load();
  }, [api, open, user?.id]);

  async function remove(identity: AnyRecord) {
    if (!user?.id || !identity.id) return;
    await api(`/api/admin/users/${user.id}/identities/${identity.id}`, { method: 'DELETE' });
    message.success('Identity unlinked');
    load();
  }

  const date = (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-');
  const canUnlink = canWriteResource(session, 'users');

  return (
    <Modal title={`Identities: ${String(user?.username ?? '')}`} open={open} onCancel={onClose} footer={null} destroyOnClose width={960}>
      <Table
        size="small"
        loading={loading}
        rowKey={(record) => String((record as AnyRecord).id)}
        dataSource={identities}
        pagination={{ pageSize: 8 }}
        expandable={{
          expandedRowRender: (record) => (
            <Input.TextArea readOnly rows={6} value={JSON.stringify((record as AnyRecord).rawProfile ?? {}, null, 2)} />
          )
        }}
        columns={[
          { title: 'Provider', render: (_, record) => String(((record as { provider?: AnyRecord }).provider?.name ?? '-') ) },
          { title: 'Type', render: (_, record) => String(((record as { provider?: AnyRecord }).provider?.type ?? '-') ) },
          { title: 'Enabled', render: (_, record) => {
            const enabled = Boolean((record as { provider?: { enabled?: boolean } }).provider?.enabled);
            return <Tag color={enabled ? 'green' : 'default'}>{enabled ? 'YES' : 'NO'}</Tag>;
          } },
          { title: 'Subject', dataIndex: 'subject' },
          { title: 'Linked', render: (_, record) => date((record as { createdAt?: string }).createdAt) },
          { title: 'Updated', render: (_, record) => date((record as { updatedAt?: string }).updatedAt) },
          {
            title: 'Action',
            render: (_, record) => canUnlink ? (
              <Popconfirm title="Unlink this external identity?" onConfirm={() => remove(record as AnyRecord)}>
                <Button size="small" danger>Remove</Button>
              </Popconfirm>
            ) : null
          }
        ]}
      />
    </Modal>
  );
}

function ResetUserPasswordModal({ session, user, open, onClose }: {
  session: Session;
  user: AnyRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  async function submit(values: { password: string; confirmPassword: string }) {
    if (!user?.id) return;
    if (values.password !== values.confirmPassword) {
      message.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api(`/api/admin/users/${user.id}/password`, { method: 'POST', body: JSON.stringify({ password: values.password }) });
      message.success('Password reset');
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Password reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={`Reset Password: ${String(user?.username ?? '')}`} open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={loading} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item name="password" label="New password" rules={[{ required: true, min: 8 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirmPassword" label="Confirm password" rules={[{ required: true, min: 8 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ChangeOwnPasswordModal({ session, open, onClose, onChanged }: {
  session: Session;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  async function submit(values: { currentPassword: string; newPassword: string; confirmPassword: string }) {
    if (values.newPassword !== values.confirmPassword) {
      message.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api('/api/currentUser/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword })
      });
      message.success('Password changed');
      onChanged();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Password change failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Change Password" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={loading} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item name="currentPassword" label="Current password" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item name="newPassword" label="New password" rules={[{ required: true, min: 8 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirmPassword" label="Confirm password" rules={[{ required: true, min: 8 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function AddressSharesModal({ session, book, open, onClose, users }: {
  session: Session;
  book: AnyRecord | null;
  open: boolean;
  onClose: () => void;
  users: AnyRecord[];
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [shares, setShares] = useState<AnyRecord[]>([]);

  function load() {
    if (!book?.id) return;
    api<AnyRecord[]>(`/api/admin/address-books/${book.id}/shares`).then(setShares).catch(() => setShares([]));
  }

  useEffect(() => {
    if (open) load();
  }, [open, book?.id]);

  async function submit(values: { userId: string; permission: string }) {
    if (!book?.id) return;
    await api(`/api/admin/address-books/${book.id}/shares`, {
      method: 'POST',
      body: JSON.stringify(values)
    });
    message.success('Share saved');
    form.resetFields();
    load();
  }

  async function remove(share: AnyRecord) {
    if (!book?.id || !share.id) return;
    await api(`/api/admin/address-books/${book.id}/shares/${share.id}`, { method: 'DELETE' });
    message.success('Share removed');
    load();
  }

  return (
    <Modal title={`Shares: ${String(book?.name ?? '')}`} open={open} onCancel={onClose} footer={null} destroyOnClose width={720}>
      <Form form={form} layout="inline" onFinish={submit} className="inline-form" initialValues={{ permission: 'read' }}>
        <Form.Item name="userId" rules={[{ required: true }]}>
          <Select
            showSearch
            placeholder="Select user"
            optionFilterProp="label"
            style={{ minWidth: 240 }}
            options={users.map((user) => ({
              value: String(user.id),
              label: `${String(user.username ?? user.id)} ${String(user.displayName ?? user.email ?? '')}`.trim()
            }))}
          />
        </Form.Item>
        <Form.Item name="permission" rules={[{ required: true }]}>
          <Select
            style={{ width: 140 }}
            options={[
              { value: 'read', label: 'Read' },
              { value: 'write', label: 'Write' },
              { value: 'owner', label: 'Owner' }
            ]}
          />
        </Form.Item>
        <Button type="primary" htmlType="submit">Share</Button>
      </Form>
      <Table
        size="small"
        rowKey={(record) => String((record as AnyRecord).id)}
        dataSource={shares}
        pagination={{ pageSize: 6 }}
        columns={[
          { title: 'User', render: (_, record) => String(((record as { user?: AnyRecord }).user?.username ?? '-')) },
          { title: 'Display name', render: (_, record) => String(((record as { user?: AnyRecord }).user?.displayName ?? '-')) },
          { title: 'Permission', dataIndex: 'permission' },
          { title: 'Action', render: (_, record) => <Button size="small" danger onClick={() => remove(record as AnyRecord)}>Remove</Button> }
        ]}
      />
    </Modal>
  );
}

function AuditDetailsModal({ log, open, onClose }: {
  log: AnyRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const date = (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-');
  const actor = log?.actor as AnyRecord | undefined;

  return (
    <Modal title="Audit Details" open={open} onCancel={onClose} footer={null} destroyOnClose width={820}>
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={[
          { key: 'Time', value: date(log?.createdAt as string | undefined) },
          { key: 'Action', value: log?.action },
          { key: 'Resource', value: log?.resource },
          { key: 'Resource ID', value: log?.resourceId },
          { key: 'Actor', value: [actor?.username, actor?.displayName].filter(Boolean).join(' / ') || log?.actorUserId || '-' },
          { key: 'IP Address', value: log?.ipAddress },
          { key: 'User Agent', value: log?.userAgent },
          { key: 'Previous hash', value: log?.previousHash },
          { key: 'Entry hash', value: log?.entryHash }
        ]}
        columns={[
          { title: 'Field', dataIndex: 'key', width: 160 },
          { title: 'Value', render: (_, record) => String((record as AnyRecord).value ?? '-') }
        ]}
      />
      <Typography.Title level={5}>Metadata</Typography.Title>
      <Input.TextArea readOnly rows={10} value={JSON.stringify(log?.metadata ?? {}, null, 2)} />
    </Modal>
  );
}

function ConnectionDetailsModal({ connection, open, onClose }: {
  connection: AnyRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const date = (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-');
  const device = connection?.device as Device | undefined;
  const startedAt = connection?.startedAt as string | undefined;
  const endedAt = connection?.endedAt as string | undefined;
  const duration = startedAt && endedAt
    ? `${Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))} seconds`
    : '-';

  return (
    <Modal title="Connection Details" open={open} onCancel={onClose} footer={null} destroyOnClose width={860}>
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={[
          { key: 'Connection ID', value: connection?.connectionId ?? connection?.id },
          { key: 'Peer RustDesk ID', value: connection?.peerRustdeskId },
          { key: 'Direction', value: connection?.direction },
          { key: 'State', value: connection?.endedAt ? 'ENDED' : 'ACTIVE' },
          { key: 'Started', value: date(startedAt) },
          { key: 'Ended', value: date(endedAt) },
          { key: 'Duration', value: duration }
        ]}
        columns={[
          { title: 'Field', dataIndex: 'key', width: 180 },
          { title: 'Value', render: (_, record) => String((record as AnyRecord).value ?? '-') }
        ]}
      />
      <Typography.Title level={5}>Device</Typography.Title>
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={[
          { key: 'RustDesk ID', value: device?.rustdeskId },
          { key: 'Hostname', value: device?.hostname },
          { key: 'User', value: device?.username },
          { key: 'Platform', value: device?.platform },
          { key: 'Status', value: device?.status }
        ]}
        columns={[
          { title: 'Field', dataIndex: 'key', width: 180 },
          { title: 'Value', render: (_, record) => String((record as AnyRecord).value ?? '-') }
        ]}
      />
      <Typography.Title level={5}>Metadata</Typography.Title>
      <Input.TextArea readOnly rows={10} value={JSON.stringify(connection?.metadata ?? {}, null, 2)} />
    </Modal>
  );
}

function RecordingRetentionModal({ session, open, onClose, onApplied }: {
  session: Session;
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [result, setResult] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(dryRun: boolean) {
    const values = form.getFieldsValue();
    setLoading(true);
    try {
      const response = await api<AnyRecord>('/api/admin/recordings/retention', {
        method: 'POST',
        body: JSON.stringify({
          dryRun,
          retentionDays: Number(values.retentionDays ?? 90),
          maxTotalGb: Number(values.maxTotalGb ?? 0)
        })
      });
      setResult(response);
      message.success(formatRetentionSummary(response, dryRun));
      if (!dryRun) onApplied();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Retention failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Recording Retention" open={open} onCancel={onClose} footer={null} destroyOnClose width={760}>
      <Form form={form} layout="inline" initialValues={{ retentionDays: 90, maxTotalGb: 0 }} className="inline-form">
        <Form.Item name="retentionDays" label="Days">
          <Input type="number" min={0} style={{ width: 120 }} />
        </Form.Item>
        <Form.Item name="maxTotalGb" label="Max GB">
          <Input type="number" min={0} step="0.1" style={{ width: 120 }} />
        </Form.Item>
        <Button onClick={() => run(true)} loading={loading}>Preview</Button>
        <Popconfirm title="Remove matching recording files?" onConfirm={() => run(false)}>
          <Button danger loading={loading}>Clean</Button>
        </Popconfirm>
      </Form>
      {result && (
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={(result.candidates as AnyRecord[]) ?? []}
          pagination={{ pageSize: 6 }}
          title={() => {
            const candidateCount = ((result.candidates as AnyRecord[]) ?? []).length;
            return `Candidates: ${candidateCount}, removed: ${String(result.removed ?? 0)}, failed: ${String(result.failed ?? 0)}, candidate bytes: ${String(result.candidateBytes ?? result.reclaimedBytes ?? '0')}, reclaimed bytes: ${String(result.reclaimedBytes ?? '0')}`;
          }}
          columns={[
            { title: 'Filename', dataIndex: 'filename' },
            { title: 'Size', dataIndex: 'sizeBytes' },
            { title: 'Started', render: (_, record) => ((record as { startedAt?: string }).startedAt ? dayjs((record as { startedAt?: string }).startedAt).format('YYYY-MM-DD HH:mm') : '-') }
          ]}
        />
      )}
    </Modal>
  );
}

function ConnectionSweepModal({ session, open, onClose, onApplied }: {
  session: Session;
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const api = useApi(session);
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [result, setResult] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(dryRun: boolean) {
    const values = form.getFieldsValue();
    setLoading(true);
    try {
      const response = await api<AnyRecord>('/api/admin/connections/stale-sweep', {
        method: 'POST',
        body: JSON.stringify({
          dryRun,
          staleAfterMinutes: Number(values.staleAfterMinutes ?? 1440),
          note: values.note || undefined
        })
      });
      setResult(response);
      message.success(formatStaleSweepSummary(response, dryRun));
      if (!dryRun) onApplied();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Stale sweep failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Stale Connection Sweep" open={open} onCancel={onClose} footer={null} destroyOnClose width={860}>
      <Form form={form} layout="inline" initialValues={{ staleAfterMinutes: 1440 }} className="inline-form">
        <Form.Item name="staleAfterMinutes" label="Minutes">
          <Input type="number" min={1} style={{ width: 130 }} />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input placeholder="Optional audit note" style={{ width: 260 }} />
        </Form.Item>
        <Button onClick={() => run(true)} loading={loading}>Preview</Button>
        <Popconfirm title="End all matching active connections?" onConfirm={() => run(false)}>
          <Button danger loading={loading}>End stale</Button>
        </Popconfirm>
      </Form>
      {result && (
        <Table
          size="small"
          rowKey={(record) => String((record as AnyRecord).id)}
          dataSource={(result.candidates as AnyRecord[]) ?? []}
          pagination={{ pageSize: 6 }}
          title={() => `Candidates: ${String(result.affected ?? 0)}, cutoff: ${result.cutoff ? dayjs(String(result.cutoff)).format('YYYY-MM-DD HH:mm') : '-'}`}
          columns={[
            { title: 'Device', render: (_, record) => ((record as { device?: Device }).device?.rustdeskId ?? '-') },
            { title: 'Hostname', render: (_, record) => ((record as { device?: Device }).device?.hostname ?? '-') },
            { title: 'Peer', dataIndex: 'peerRustdeskId' },
            { title: 'Direction', dataIndex: 'direction' },
            { title: 'Started', render: (_, record) => ((record as { startedAt?: string }).startedAt ? dayjs((record as { startedAt?: string }).startedAt).format('YYYY-MM-DD HH:mm') : '-') }
          ]}
        />
      )}
    </Modal>
  );
}

function SystemHealthPanel({ session, reloadKey }: { session: Session; reloadKey: number }) {
  const { message } = AntApp.useApp();
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/system/health`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      const body = await response.json() as HealthCheckResult | { error?: string };
      if (!response.ok && !('checks' in body)) {
        throw new Error('error' in body ? body.error : `Health check failed: ${response.status}`);
      }
      setHealth(body as HealthCheckResult);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Health check failed');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [reloadKey, session.token]);

  const counts = (health?.checks.counts ?? {}) as Record<string, number>;
  const authRateLimit = (health?.checks.authRateLimit ?? {}) as { windowSeconds?: number; max?: number };
  const externalLogin = (health?.checks.externalLogin ?? {}) as {
    enabledProviders?: number;
    defaultExternalUserRole?: string | null;
    providers?: Array<{ id: string; name: string; type: string; ready: boolean; missing: string[]; startUrl?: string; callbackUrl?: string }>;
  };
  const auditChain = (health?.checks.auditChain ?? {}) as {
    ok?: boolean;
    checked?: number;
    missingHash?: number;
    total?: number;
    truncated?: boolean;
    headHash?: string | null;
    issues?: Array<{ id: string; createdAt: string; reason: string }>;
  };
  const webOrigins = Array.isArray(health?.checks.webOrigins) ? health.checks.webOrigins : [];

  return (
    <Space direction="vertical" className="detail-stack" size={16}>
      <Space wrap>
        <Button onClick={() => { void load(); }} loading={loading}>Refresh</Button>
        <Tag color={health?.ok ? 'green' : 'red'}>{health?.ok ? 'HEALTHY' : 'NEEDS ATTENTION'}</Tag>
        <Typography.Text type="secondary">{health?.service ?? 'rustdesk-admin-server'}</Typography.Text>
      </Space>
      {health?.errors.map((error) => <Alert key={error} type="error" showIcon message={error} />)}
      {health?.warnings.map((warning) => <Alert key={warning} type="warning" showIcon message={warning} />)}
      {!health && !loading && <Alert type="error" showIcon message="Health diagnostics are not available." />}
      <div className="health-grid">
        <Card><Statistic title="Users" value={counts.users ?? 0} /></Card>
        <Card><Statistic title="Roles" value={counts.roles ?? 0} /></Card>
        <Card><Statistic title="Permissions" value={counts.permissions ?? 0} /></Card>
        <Card><Statistic title="Devices" value={counts.devices ?? 0} /></Card>
        <Card><Statistic title="Groups" value={counts.deviceGroups ?? 0} /></Card>
        <Card><Statistic title="Policies" value={counts.strategies ?? 0} /></Card>
        <Card><Statistic title="Policy Receipts" value={counts.strategyReceipts ?? 0} /></Card>
        <Card><Statistic title="Address Books" value={counts.addressBooks ?? 0} /></Card>
        <Card><Statistic title="Connections" value={counts.connections ?? 0} /></Card>
        <Card><Statistic title="Active Connections" value={counts.activeConnections ?? 0} /></Card>
        <Card><Statistic title="Recordings" value={counts.recordings ?? 0} /></Card>
        <Card><Statistic title="Login Providers" value={counts.identityProviders ?? 0} /></Card>
        <Card><Statistic title="External Identities" value={counts.externalIdentityAccounts ?? 0} /></Card>
      </div>
      <Table
        size="small"
        loading={loading}
        pagination={false}
        rowKey="key"
        dataSource={[
          { key: 'Database', value: String(health?.checks.database ?? '-') },
          { key: 'Seed data', value: typeof health?.checks.seedData === 'string' ? health.checks.seedData : JSON.stringify(health?.checks.seedData ?? {}) },
          { key: 'Permissions', value: typeof health?.checks.permissions === 'string' ? health.checks.permissions : JSON.stringify(health?.checks.permissions ?? {}) },
          { key: 'Seeded roles', value: typeof health?.checks.roles === 'string' ? health.checks.roles : JSON.stringify(health?.checks.roles ?? {}) },
          { key: 'Recording directory', value: String(health?.checks.recordingDir ?? '-') },
          { key: 'Recording upload max', value: `${String(health?.checks.recordingUploadMaxMb ?? '-')} MB` },
          { key: 'Connection stale threshold', value: `${String(health?.checks.connectionStaleAfterMinutes ?? '-')} minutes` },
          { key: 'Public base URL', value: String(health?.checks.publicBaseUrl ?? '-') },
          { key: 'Session TTL', value: String(health?.checks.sessionTtl ?? '-') },
          { key: 'Auth rate limit', value: authRateLimit.max && authRateLimit.windowSeconds ? `${authRateLimit.max} / ${authRateLimit.windowSeconds}s` : '-' },
          { key: 'Audit chain', value: auditChain.ok === undefined ? '-' : `${auditChain.ok ? 'verified' : 'issues'} (${String(auditChain.checked ?? 0)}/${String(auditChain.total ?? 0)} checked, missing hash: ${String(auditChain.missingHash ?? 0)})` },
          { key: 'Audit head hash', value: auditChain.headHash ?? '-' },
          { key: 'Web origins', value: webOrigins.join(', ') || '-' },
          { key: 'External login providers', value: String(externalLogin.enabledProviders ?? 0) },
          { key: 'Default external role', value: externalLogin.defaultExternalUserRole ?? '-' }
        ]}
        columns={[
          { title: 'Check', dataIndex: 'key', width: 220 },
          { title: 'Value', dataIndex: 'value' }
        ]}
      />
      {(auditChain.issues?.length ?? 0) > 0 && (
        <Table
          size="small"
          loading={loading}
          rowKey="id"
          dataSource={auditChain.issues ?? []}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: 'Audit ID', dataIndex: 'id' },
            { title: 'Reason', dataIndex: 'reason' },
            { title: 'Time', render: (_, record) => dayjs((record as { createdAt: string }).createdAt).format('YYYY-MM-DD HH:mm:ss') }
          ]}
        />
      )}
      <Table
        size="small"
        loading={loading}
        rowKey="id"
        dataSource={externalLogin.providers ?? []}
        pagination={false}
        columns={[
          { title: 'Provider', dataIndex: 'name' },
          { title: 'Type', dataIndex: 'type' },
          { title: 'Ready', render: (_, record) => <Tag color={(record as { ready?: boolean }).ready ? 'green' : 'red'}>{(record as { ready?: boolean }).ready ? 'READY' : 'MISSING'}</Tag> },
          { title: 'Start URL', render: (_, record) => String((record as { startUrl?: string }).startUrl ?? '-') },
          { title: 'Callback URL', render: (_, record) => String((record as { callbackUrl?: string }).callbackUrl ?? '-') },
          { title: 'Missing', render: (_, record) => ((record as { missing?: string[] }).missing ?? []).join(', ') || '-' }
        ]}
      />
    </Space>
  );
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { locale, setLocale, t } = useI18n();
  const navItems = useMemo(() => ([
    ['devices', Monitor, t('nav.devices')],
    ['groups', Radio, t('nav.groups')],
    ['users', Users, t('nav.users')],
    ['roles', ShieldCheck, t('nav.roles')],
    ['strategies', KeyRound, t('nav.strategies')],
    ['addressBooks', BookOpen, t('nav.addressBooks')],
    ['connections', ClipboardList, t('nav.connections')],
    ['recordings', Video, t('nav.recordings')],
    ['policyReceipts', ClipboardList, t('nav.policyReceipts')],
    ['auditLogs', ClipboardList, t('nav.auditLogs')],
    ['systemHealth', Activity, t('nav.systemHealth')],
    ['identityProviders', KeyRound, t('nav.identityProviders')]
  ] as const).filter(([key]) => canReadResource(session, key)), [session, t]);
  const firstReadable = navItems[0]?.[0] ?? 'devices';
  const [selected, setSelected] = useState<ResourceKey>(firstReadable);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AnyRecord | null>(null);
  const [specialModal, setSpecialModal] = useState<SpecialModal>(null);
  const [filtersByResource, setFiltersByResource] = useState<Record<ResourceKey, ResourceFilters>>({} as Record<ResourceKey, ResourceFilters>);
  const [reloadKey, setReloadKey] = useState(0);
  const api = useApi(session);
  const [summary, setSummary] = useState({ devices: 0, recordings: 0, audit: 0 });
  const [references, setReferences] = useState<ReferenceData>({ devices: [], groups: [], roles: [], permissions: [], users: [], strategies: [] });

  useEffect(() => {
    if (!navItems.some(([key]) => key === selected)) {
      setSelected(firstReadable);
    }
  }, [firstReadable, navItems, selected]);

  useEffect(() => {
    const loadCount = (allowed: boolean, path: string) => allowed ? api<unknown[]>(path).then((rows) => rows.length).catch(() => 0) : Promise.resolve(0);
    Promise.all([
      loadCount(canReadResource(session, 'devices'), '/api/admin/devices'),
      loadCount(canReadResource(session, 'recordings'), '/api/admin/recordings'),
      loadCount(canReadResource(session, 'auditLogs'), '/api/admin/audit-logs')
    ]).then(([devices, recordings, audit]) => setSummary({ devices, recordings, audit }));
  }, [api, reloadKey, session]);

  useEffect(() => {
    const loadReference = (allowed: boolean, path: string) => allowed ? api<AnyRecord[]>(path).catch(() => []) : Promise.resolve([]);
    Promise.all([
      loadReference(canReadResource(session, 'devices'), '/api/admin/devices'),
      loadReference(canReadResource(session, 'groups'), '/api/admin/device-groups'),
      loadReference(canReadResource(session, 'roles'), '/api/admin/roles'),
      loadReference(canReadResource(session, 'roles'), '/api/admin/permissions'),
      loadReference(canReadResource(session, 'users'), '/api/admin/users'),
      loadReference(canReadResource(session, 'strategies'), '/api/admin/strategies')
    ])
      .then(([devices, groups, roles, permissions, users, strategies]) => setReferences({ devices, groups, roles, permissions, users, strategies }));
  }, [api, reloadKey, session]);

  if (navItems.length === 0) {
    return (
      <Layout className="app-shell">
        <Layout.Header className="topbar">
          <Space>
            <span>{session.user.username}</span>
            <Button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>{locale === 'zh' ? 'English' : '中文'}</Button>
            {session.user.hasLocalPassword && <Button onClick={() => setSpecialModal({ kind: 'changeOwnPassword' })}>{t('action.changePassword')}</Button>}
            <Button onClick={onLogout}>{t('action.signOut')}</Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="content">
          <Card>
            <Typography.Title level={4}>{t('empty.noPermissionsTitle')}</Typography.Title>
            <Typography.Paragraph>{t('empty.noPermissionsText')}</Typography.Paragraph>
          </Card>
        </Layout.Content>
      </Layout>
    );
  }

  return (
    <Layout className="app-shell">
      <Layout.Sider width={232} theme="light" className="sider">
        <div className="brand">{t('app.name')}</div>
        <Menu mode="inline" selectedKeys={[selected]} onClick={(item) => setSelected(item.key as ResourceKey)} items={navItems.map(([key, Icon, label]) => ({ key, icon: <Icon size={18} />, label }))} />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="topbar">
          <Space>
            <span>{session.user.username}</span>
            <Button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>{locale === 'zh' ? 'English' : '中文'}</Button>
            {session.user.hasLocalPassword && <Button onClick={() => setSpecialModal({ kind: 'changeOwnPassword' })}>{t('action.changePassword')}</Button>}
            <Button onClick={onLogout}>{t('action.signOut')}</Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="content">
          <div className="stats">
            <Card><Statistic title={t('stat.devices')} value={summary.devices} /></Card>
            <Card><Statistic title={t('stat.recordings')} value={summary.recordings} /></Card>
            <Card><Statistic title={t('stat.auditEvents')} value={summary.audit} /></Card>
          </div>
          <Card
            className="table-card"
            title={resourceLabel(selected)}
            extra={
              <Space>
                {selected === 'devices' && <DeviceExportButton session={session} filters={filtersByResource.devices ?? {}} />}
                {selected === 'groups' && <GroupExportButton session={session} filters={filtersByResource.groups ?? {}} />}
                {selected === 'roles' && <RoleExportButton session={session} />}
                {selected === 'strategies' && <PolicyExportButton session={session} filters={filtersByResource.strategies ?? {}} />}
                {selected === 'addressBooks' && <AddressBookExportButton session={session} filters={filtersByResource.addressBooks ?? {}} />}
                {selected === 'recordings' && <RecordingExportButton session={session} filters={filtersByResource.recordings ?? {}} />}
                {selected === 'recordings' && canWriteResource(session, 'recordings') && <Button type="primary" onClick={() => setSpecialModal({ kind: 'recordingUpload' })}>{t('action.upload')}</Button>}
                {selected === 'recordings' && canWriteResource(session, 'recordings') && <Button onClick={() => setSpecialModal({ kind: 'recordingRetention' })}>{t('action.retention')}</Button>}
                {selected === 'connections' && canWriteResource(session, 'connections') && <Button onClick={() => setSpecialModal({ kind: 'connectionSweep' })}>{t('action.staleSweep')}</Button>}
                {selected === 'connections' && <ConnectionExportButton session={session} filters={filtersByResource.connections ?? {}} />}
                {selected === 'policyReceipts' && <PolicyReceiptExportButton session={session} filters={filtersByResource.policyReceipts ?? {}} />}
                {selected === 'identityProviders' && <IdentityProviderExportButton session={session} />}
                {selected === 'users' && <UserExportButton session={session} filters={filtersByResource.users ?? {}} />}
                {selected === 'auditLogs' && <AuditVerifyButton session={session} />}
                {selected === 'auditLogs' && <AuditExportButton session={session} filters={filtersByResource.auditLogs ?? {}} />}
                {canCreate(session, selected) ? <Button type="primary" onClick={() => { setEditingRecord(null); setModalOpen(true); }}>{t('action.create')}</Button> : null}
              </Space>
            }
          >
            <FilterBar
              resource={selected}
              references={references}
              filters={filtersByResource[selected] ?? {}}
              onChange={(filters) => setFiltersByResource((current) => ({ ...current, [selected]: filters }))}
            />
            {selected === 'systemHealth' ? (
              <SystemHealthPanel session={session} reloadKey={reloadKey} />
            ) : (
              <ResourceTable
                resource={selected}
                session={session}
                reloadKey={reloadKey}
                filters={filtersByResource[selected] ?? {}}
                onEdit={(record) => {
                  setEditingRecord(record);
                  setModalOpen(true);
                }}
                onDeleted={() => setReloadKey((value) => value + 1)}
                onSpecial={setSpecialModal}
                references={references}
              />
            )}
          </Card>
          {(canCreate(session, selected) || (selected === 'recordings' && editingRecord && canWriteResource(session, 'recordings'))) && (
            <CreateResourceModal
              resource={selected}
              session={session}
              open={modalOpen}
              record={editingRecord}
              references={references}
              onClose={() => {
                setModalOpen(false);
                setEditingRecord(null);
              }}
              onCreated={() => setReloadKey((value) => value + 1)}
            />
          )}
          <PolicyAssignmentModal
            session={session}
            policy={specialModal?.kind === 'assignPolicy' ? specialModal.record : null}
            open={specialModal?.kind === 'assignPolicy'}
            references={references}
            onClose={() => setSpecialModal(null)}
          />
          <DeviceDetailsModal
            session={session}
            device={specialModal?.kind === 'deviceDetails' ? specialModal.record : null}
            open={specialModal?.kind === 'deviceDetails'}
            onClose={() => setSpecialModal(null)}
          />
          <GroupDetailsModal
            session={session}
            group={specialModal?.kind === 'groupDetails' ? specialModal.record : null}
            open={specialModal?.kind === 'groupDetails'}
            onClose={() => setSpecialModal(null)}
          />
          <UserIdentitiesModal
            session={session}
            user={specialModal?.kind === 'userIdentities' ? specialModal.record : null}
            open={specialModal?.kind === 'userIdentities'}
            onClose={() => setSpecialModal(null)}
          />
          <ResetUserPasswordModal
            session={session}
            user={specialModal?.kind === 'resetUserPassword' ? specialModal.record : null}
            open={specialModal?.kind === 'resetUserPassword'}
            onClose={() => setSpecialModal(null)}
          />
          <ChangeOwnPasswordModal
            session={session}
            open={specialModal?.kind === 'changeOwnPassword'}
            onClose={() => setSpecialModal(null)}
            onChanged={onLogout}
          />
          <AddressPeersModal
            session={session}
            book={specialModal?.kind === 'addressPeers' ? specialModal.record : null}
            open={specialModal?.kind === 'addressPeers'}
            onClose={() => setSpecialModal(null)}
          />
          <AddressSharesModal
            session={session}
            book={specialModal?.kind === 'addressShares' ? specialModal.record : null}
            open={specialModal?.kind === 'addressShares'}
            users={references.users}
            onClose={() => setSpecialModal(null)}
          />
          <AddressTagsModal
            session={session}
            book={specialModal?.kind === 'addressTags' ? specialModal.record : null}
            open={specialModal?.kind === 'addressTags'}
            onClose={() => setSpecialModal(null)}
          />
          <AuditDetailsModal
            log={specialModal?.kind === 'auditDetails' ? specialModal.record : null}
            open={specialModal?.kind === 'auditDetails'}
            onClose={() => setSpecialModal(null)}
          />
          <ConnectionDetailsModal
            connection={specialModal?.kind === 'connectionDetails' ? specialModal.record : null}
            open={specialModal?.kind === 'connectionDetails'}
            onClose={() => setSpecialModal(null)}
          />
          <ConnectionSweepModal
            session={session}
            open={specialModal?.kind === 'connectionSweep'}
            onClose={() => setSpecialModal(null)}
            onApplied={() => setReloadKey((value) => value + 1)}
          />
          <RecordingRetentionModal
            session={session}
            open={specialModal?.kind === 'recordingRetention'}
            onClose={() => setSpecialModal(null)}
            onApplied={() => setReloadKey((value) => value + 1)}
          />
          <RecordingUploadModal
            session={session}
            open={specialModal?.kind === 'recordingUpload'}
            devices={references.devices}
            onClose={() => setSpecialModal(null)}
            onUploaded={() => setReloadKey((value) => value + 1)}
          />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

function Root() {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem('rustdesk-admin-locale');
    return stored === 'en' ? 'en' : 'zh';
  });
  const [session, setSession] = useState<Session | null>(() => {
    const stored = localStorage.getItem('rustdesk-admin-session');
    return stored ? (JSON.parse(stored) as Session) : null;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (!token) return;

    fetch(`${API_BASE}/api/currentUser`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? 'External login session is invalid');
        }
        return response.json();
      })
      .then((user) => {
        const nextSession = { token, user };
        localStorage.setItem('rustdesk-admin-session', JSON.stringify(nextSession));
        setSession(nextSession);
        url.searchParams.delete('token');
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
      })
      .catch(() => {
        localStorage.removeItem('rustdesk-admin-session');
        setSession(null);
        url.searchParams.delete('token');
        url.searchParams.set('error', 'External login session is invalid');
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
      });
  }, []);

  const i18n = useMemo(() => ({
    locale,
    setLocale: (nextLocale: Locale) => {
      localStorage.setItem('rustdesk-admin-locale', nextLocale);
      setLocaleState(nextLocale);
    },
    t: (key: string) => messages[locale][key] ?? messages.en[key] ?? key
  }), [locale]);

  return (
    <I18nContext.Provider value={i18n}>
      <ConfigProvider theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6 } }}>
        <AntApp>
          {session ? (
            <Dashboard
              session={session}
              onLogout={() => {
                localStorage.removeItem('rustdesk-admin-session');
                setSession(null);
              }}
            />
          ) : (
            <Login onLogin={setSession} />
          )}
        </AntApp>
      </ConfigProvider>
    </I18nContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);

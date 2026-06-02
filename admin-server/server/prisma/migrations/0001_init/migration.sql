-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('DISABLED', 'NORMAL', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "AuthProviderType" AS ENUM ('LOCAL', 'OIDC', 'WECOM', 'DINGTALK');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('OFFLINE', 'ONLINE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'HEARTBEAT', 'SYSINFO', 'STRATEGY_PUSH', 'RECORD_UPLOAD', 'RECORD_DOWNLOAD', 'DISCONNECT', 'POLICY_APPLY', 'AUDIT_EXPORT', 'ADDRESS_BOOK_SYNC');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('UPLOADING', 'COMPLETED', 'REMOVED', 'FAILED');

-- CreateEnum
CREATE TYPE "StrategyApplyStatus" AS ENUM ('PENDING', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatar" TEXT,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'NORMAL',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "IdentityProvider" (
    "id" TEXT NOT NULL,
    "type" "AuthProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "issuerUrl" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "corpId" TEXT,
    "agentId" TEXT,
    "appKey" TEXT,
    "appSecret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityProviderAccount" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "rawProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "rustdeskId" TEXT NOT NULL,
    "uuid" TEXT,
    "hostname" TEXT,
    "username" TEXT,
    "platform" TEXT,
    "os" TEXT,
    "version" TEXT,
    "ipAddress" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "clientTokenHash" TEXT,
    "clientTokenIssuedAt" TIMESTAMP(3),
    "lastClientAuthAt" TIMESTAMP(3),
    "sysinfo" JSONB,
    "sysinfoVersion" INTEGER NOT NULL DEFAULT 0,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceHeartbeat" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "conns" JSONB,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionRecord" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "connectionId" INTEGER,
    "peerRustdeskId" TEXT,
    "direction" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "ConnectionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "configOptions" JSONB NOT NULL DEFAULT '{}',
    "extra" JSONB NOT NULL DEFAULT '{}',
    "modifiedAt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyAssignment" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyApplyReceipt" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "strategyId" TEXT,
    "modifiedAt" INTEGER NOT NULL DEFAULT 0,
    "hash" TEXT,
    "status" "StrategyApplyStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "metadata" JSONB,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyApplyReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressBook" (
    "id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "shareRule" TEXT NOT NULL DEFAULT 'read',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressBookShare" (
    "id" TEXT NOT NULL,
    "addressBookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'read',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressBookShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressBookPeer" (
    "id" TEXT NOT NULL,
    "addressBookId" TEXT NOT NULL,
    "deviceId" TEXT,
    "rustdeskId" TEXT NOT NULL,
    "alias" TEXT,
    "username" TEXT,
    "hostname" TEXT,
    "platform" TEXT,
    "password" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressBookPeer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressBookTag" (
    "id" TEXT NOT NULL,
    "addressBookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "AddressBookTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "status" "RecordingStatus" NOT NULL DEFAULT 'UPLOADING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "previousHash" TEXT,
    "entryHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProvider_type_name_key" ON "IdentityProvider"("type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProviderAccount_providerId_subject_key" ON "IdentityProviderAccount"("providerId", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceGroup_name_key" ON "DeviceGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Device_rustdeskId_key" ON "Device"("rustdeskId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_uuid_key" ON "Device"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Device_clientTokenHash_key" ON "Device"("clientTokenHash");

-- CreateIndex
CREATE INDEX "DeviceHeartbeat_deviceId_createdAt_idx" ON "DeviceHeartbeat"("deviceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_name_key" ON "Strategy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyAssignment_strategyId_deviceId_key" ON "StrategyAssignment"("strategyId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyAssignment_strategyId_groupId_key" ON "StrategyAssignment"("strategyId", "groupId");

-- CreateIndex
CREATE INDEX "StrategyApplyReceipt_deviceId_updatedAt_idx" ON "StrategyApplyReceipt"("deviceId", "updatedAt");

-- CreateIndex
CREATE INDEX "StrategyApplyReceipt_strategyId_updatedAt_idx" ON "StrategyApplyReceipt"("strategyId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AddressBook_guid_key" ON "AddressBook"("guid");

-- CreateIndex
CREATE UNIQUE INDEX "AddressBookShare_addressBookId_userId_key" ON "AddressBookShare"("addressBookId", "userId");

-- CreateIndex
CREATE INDEX "AddressBookShare_userId_idx" ON "AddressBookShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AddressBookPeer_addressBookId_rustdeskId_key" ON "AddressBookPeer"("addressBookId", "rustdeskId");

-- CreateIndex
CREATE UNIQUE INDEX "AddressBookTag_addressBookId_name_key" ON "AddressBookTag"("addressBookId", "name");

-- CreateIndex
CREATE INDEX "Recording_deviceId_startedAt_idx" ON "Recording"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_entryHash_key" ON "AuditLog"("entryHash");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityProviderAccount" ADD CONSTRAINT "IdentityProviderAccount_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityProviderAccount" ADD CONSTRAINT "IdentityProviderAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DeviceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceHeartbeat" ADD CONSTRAINT "DeviceHeartbeat_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionRecord" ADD CONSTRAINT "ConnectionRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyAssignment" ADD CONSTRAINT "StrategyAssignment_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyAssignment" ADD CONSTRAINT "StrategyAssignment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyAssignment" ADD CONSTRAINT "StrategyAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DeviceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyApplyReceipt" ADD CONSTRAINT "StrategyApplyReceipt_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyApplyReceipt" ADD CONSTRAINT "StrategyApplyReceipt_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressBook" ADD CONSTRAINT "AddressBook_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressBookShare" ADD CONSTRAINT "AddressBookShare_addressBookId_fkey" FOREIGN KEY ("addressBookId") REFERENCES "AddressBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressBookShare" ADD CONSTRAINT "AddressBookShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressBookPeer" ADD CONSTRAINT "AddressBookPeer_addressBookId_fkey" FOREIGN KEY ("addressBookId") REFERENCES "AddressBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressBookPeer" ADD CONSTRAINT "AddressBookPeer_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressBookTag" ADD CONSTRAINT "AddressBookTag_addressBookId_fkey" FOREIGN KEY ("addressBookId") REFERENCES "AddressBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


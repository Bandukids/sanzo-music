import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
 id: text('id').primaryKey(), email: text('email').notNull(), name: text('name').notNull(),
 bytes: integer('bytes').notNull().default(0), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
});
export const documents = sqliteTable('documents', {
 owner: text('owner').notNull().references(() => users.id), namespace: text('namespace').notNull(),
 data: text('data').notNull(), revision: integer('revision').notNull().default(1), updatedAt: text('updated_at').notNull()
}, t => [primaryKey({ columns: [t.owner, t.namespace] })]);
export const assets = sqliteTable('assets', {
 id: text('id').notNull(), owner: text('owner').notNull().references(() => users.id),
 key: text('object_key').notNull(), name: text('name').notNull(), mime: text('mime').notNull(),
 bytes: integer('bytes').notNull(), kind: text('kind').notNull(), status: text('status').notNull(),
 createdAt: text('created_at').notNull()
}, t => [primaryKey({ columns: [t.owner, t.id] }), index('assets_owner_status').on(t.owner, t.status)]);

export const generations = sqliteTable('generations', {
 id: text('id').primaryKey(), owner: text('owner').notNull().references(() => users.id),
 requestKey: text('request_key').notNull(), provider: text('provider').notNull(),
 input: text('input').notNull(), taskId: text('task_id'), status: text('status').notNull(),
 assetId: text('asset_id'), error: text('error'), usage: text('usage'),
 leaseUntil: integer('lease_until').notNull().default(0), checkedAt: integer('checked_at').notNull().default(0),
 createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
}, t => [uniqueIndex('generations_owner_request').on(t.owner,t.requestKey),index('generations_owner_created').on(t.owner,t.createdAt)]);

export const releases = sqliteTable('releases', {
 generationId:text('generation_id').primaryKey().references(()=>generations.id),
 owner:text('owner').notNull().references(()=>users.id),
 metadata:text('metadata').notNull(),publishedAt:text('published_at').notNull()
},t=>[index('releases_published').on(t.publishedAt)]);

export const covers=sqliteTable('covers',{
 owner:text('owner').notNull().references(()=>users.id),targetType:text('target_type').notNull(),targetId:text('target_id').notNull(),
 id:text('id').notNull(),requestKey:text('request_key').notNull(),provider:text('provider').notNull(),taskId:text('task_id'),
 status:text('status').notNull(),art:text('art').notNull(),assetId:text('asset_id'),prompt:text('prompt').notNull(),error:text('error'),
 leaseUntil:integer('lease_until').notNull().default(0),checkedAt:integer('checked_at').notNull().default(0),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.owner,t.targetType,t.targetId]}),uniqueIndex('covers_id').on(t.id)]);

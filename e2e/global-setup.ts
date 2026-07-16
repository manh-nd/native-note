import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const DESKTOP_USER_ID = "e2e-desktop-user";
const MOBILE_USER_ID = "e2e-mobile-user";
const DESKTOP_WORKSPACE_ID = "00000000-0000-4000-8000-000000000010";
const MOBILE_WORKSPACE_ID = "00000000-0000-4000-8000-000000000011";
const DESKTOP_PAGE_ID = "00000000-0000-4000-8000-000000000020";
const MOBILE_PAGE_ID = "00000000-0000-4000-8000-000000000021";
const DESKTOP_TOKEN = "native-note-e2e-desktop-session-token";
const MOBILE_TOKEN = "native-note-e2e-mobile-session-token";

export default async function globalSetup() {
  const sql = postgres(
    process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/native_note",
    { max: 1 }
  );
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId: "00000000-0000-4000-8000-000000000101" },
        content: [{ type: "text", text: "First block" }],
      },
      {
        type: "paragraph",
        attrs: { blockId: "00000000-0000-4000-8000-000000000102" },
        content: [{ type: "text", text: "Second block" }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            attrs: { blockId: "00000000-0000-4000-8000-000000000103" },
            content: [
              {
                type: "paragraph",
                attrs: { blockId: "00000000-0000-4000-8000-000000000104" },
                content: [{ type: "text", text: "Bullet item" }],
              },
            ],
          },
        ],
      },
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            attrs: { blockId: "00000000-0000-4000-8000-000000000105" },
            content: [
              {
                type: "paragraph",
                attrs: { blockId: "00000000-0000-4000-8000-000000000106" },
                content: [{ type: "text", text: "Number item" }],
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        attrs: { blockId: "00000000-0000-4000-8000-000000000107" },
      },
    ],
  };
  await sql.begin(async (tx) => {
    await tx`insert into users (id, name, email) values (${DESKTOP_USER_ID}, 'E2E Learner', 'e2e-desktop@example.com') on conflict (id) do update set name = excluded.name`;
    await tx`insert into users (id, name, email) values (${MOBILE_USER_ID}, 'E2E Learner', 'e2e-mobile@example.com') on conflict (id) do update set name = excluded.name`;
    await tx`insert into workspaces (id, user_id, name) values (${DESKTOP_WORKSPACE_ID}, ${DESKTOP_USER_ID}, 'E2E Workspace') on conflict (id) do update set user_id = excluded.user_id, name = excluded.name`;
    await tx`insert into workspaces (id, user_id, name) values (${MOBILE_WORKSPACE_ID}, ${MOBILE_USER_ID}, 'E2E Workspace') on conflict (id) do update set user_id = excluded.user_id, name = excluded.name`;
    await tx`delete from pages where workspace_id = ${DESKTOP_WORKSPACE_ID} and id <> ${DESKTOP_PAGE_ID}`;
    await tx`delete from pages where workspace_id = ${MOBILE_WORKSPACE_ID} and id <> ${MOBILE_PAGE_ID}`;
    await tx`insert into pages (id, workspace_id, title, content, document_schema_version, plain_text, position, content_revision, metadata_revision) values (${DESKTOP_PAGE_ID}, ${DESKTOP_WORKSPACE_ID}, 'Block editor test', ${tx.json(content)}, 1, 'First block\nSecond block\nBullet item\nNumber item', 0, 1, 1) on conflict (id) do update set title = excluded.title, content = excluded.content, document_schema_version = excluded.document_schema_version, plain_text = excluded.plain_text, parent_id = null, position = 0, content_revision = 1, metadata_revision = 1, deleted_at = null`;
    await tx`insert into pages (id, workspace_id, title, content, document_schema_version, plain_text, position, content_revision, metadata_revision) values (${MOBILE_PAGE_ID}, ${MOBILE_WORKSPACE_ID}, 'Block editor test', ${tx.json(content)}, 1, 'First block\nSecond block\nBullet item\nNumber item', 0, 1, 1) on conflict (id) do update set title = excluded.title, content = excluded.content, document_schema_version = excluded.document_schema_version, plain_text = excluded.plain_text, parent_id = null, position = 0, content_revision = 1, metadata_revision = 1, deleted_at = null`;
    await tx`insert into sessions (session_token, user_id, expires) values (${DESKTOP_TOKEN}, ${DESKTOP_USER_ID}, ${expires}), (${MOBILE_TOKEN}, ${MOBILE_USER_ID}, ${expires}) on conflict (session_token) do update set user_id = excluded.user_id, expires = excluded.expires`;
  });
  await sql.end();
  await mkdir(path.resolve(".playwright"), { recursive: true });
  const state = (token: string) =>
    JSON.stringify({
      cookies: [
        {
          name: "authjs.session-token",
          value: token,
          domain: "127.0.0.1",
          path: "/",
          expires: Math.floor(expires.getTime() / 1000),
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    });
  await Promise.all([
    writeFile(
      path.resolve(".playwright/desktop-state.json"),
      state(DESKTOP_TOKEN)
    ),
    writeFile(
      path.resolve(".playwright/mobile-state.json"),
      state(MOBILE_TOKEN)
    ),
  ]);
}

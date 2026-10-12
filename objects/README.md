# Cogover Objects the apps need

This page lists every Object and field the three data apps use — **Công việc** (Tasks), **Ghi chú** (Notes) and **Cài đặt** (Settings) — so you can create them in your own Workspace. **Dev tools** needs none of this.

Slugs must match exactly: the apps address Objects and fields by slug (and a few of them by ID, see [IDs to configure](#ids-to-configure)). Labels are free; the ones below are the labels of the reference setup — the Workspace the app was first built on (English / Vietnamese).

## Overview

| Object (slug) | Used by | You create it? |
| --- | --- | --- |
| `task` | Tasks | Yes (or reuse the Workspace's Task Object if it already has these fields) |
| `activity` | Tasks (timeline, notes) | Built in — add one lookup field `Task` |
| `notes_cat` | Notes (folders) | Yes |
| `notes_content` | Notes (notes) | Yes |
| `notes_tag` | Notes (tags) | Yes |
| `notes_pin` | Notes (pins) | Yes |
| `user_settings` | Settings | Yes |
| `personnel` | all (people, "me") | Built in |
| `department`, `department_personnel` | Notes (sharing with departments) | Built in |

Every Object also has the system fields `id`, `created`, `updated`, `created_by`, `updated_by`; the apps read them but you do not create them.

Field types below are Cogover field types: `short_text`, `long_text`, `auto_number`, `date_time`, `single_choice`, `lookup_normal`, `reference`, `file`, `numeric`, `boolean`.

---

## 1. `task` — Task / Công việc

Record name: `name`, auto number `TAS-0000`.

| Field (slug) | Type | Required | Label (EN / VI) | Settings |
| --- | --- | --- | --- | --- |
| `name` | `auto_number` | yes | Serial | prefix `TAS-`, format `0000` |
| `subject` | `short_text` | yes | Subject / Tiêu đề | 1–255 characters |
| `description` | `long_text` | no | Description / Mô tả | rich text (`text_type` 2), up to 32,000 characters |
| `due_date` | `date_time` | yes | Due Date / Hạn hoàn thành | time zone `Asia/Ho_Chi_Minh` |
| `priority` | `single_choice` | no | Priority / Độ ưu tiên | options below, default `medium` |
| `status` | `single_choice` | yes | Status / Trạng thái | options below, default `new` |
| `reporter` | `lookup_normal` → `personnel` | no | Reporter / Người giao việc | single |
| `assignee` | `lookup_normal` → `personnel` | yes | Assignee / Người được giao | single |
| `ccs` | `lookup_normal` → `personnel` | no | CCs / Người theo dõi | multiple, up to 30 |
| `attachment_files` | `file` | no | Attachment files / File đính kèm | multiple, 1–10 files, 50 MB each, private; allowed types below |
| `_attachments` | `file` (system) | — | Attachments | created by the platform; holds the pictures pasted into `description`. You only need its **ID** |

`priority` options (slug — label): `urgent` — Khẩn cấp · `high` — Cao · `medium` — Trung bình (default) · `low` — Thấp.

`status` options (slug — label), in display order:

| Slug | Label | Group |
| --- | --- | --- |
| `new` (default) | Mới | open |
| `in_progress` | Đang xử lý | open |
| `pending` | Đang chờ | open |
| `on_hold` | Tạm dừng | open |
| `resolved` | Đã xử lý | done |
| `closed` | Đã đóng | done |
| `cancelled` | Đã huỷ | done |

`attachment_files` file types of the reference setup: doc, docx, xlsx, xls, csv, ppt, pptx, pdf, txt, rtf, html, htm, zip, json, md, jpg, jpeg, png, gif, webp, svg, bmp, tiff, tif, heic, mp4, mov, avi, wmv, mkv, mp3. The app does not check the extension itself (the server decides), but it limits a task to 10 files of at most 50 MB.

Other fields of a standard Task Object (project, labels, estimate, parent…) are not used by the app and may exist or not. If a field you add is required, give it a default value: the app only sends the fields in the table.

### Optional: status workflow

If the Workspace has an active **transition rule** on `status`, the app reads it (`GET /api/v1/object_security/transition_rule?objectSlug=task`) and only offers the allowed steps. The reference rule: create at `new`; `new` → `in_progress` | `cancelled`; `in_progress` → `pending` | `on_hold` | `resolved`; `pending` → `in_progress` | `resolved` | `cancelled`; `on_hold` → `in_progress` | `cancelled`; `resolved` → `closed`. Without a rule every status is offered.

---

## 2. `activity` — Activity (built in)

The timeline under a task and the notes written from it. The Object exists in every Workspace; add **one field**:

| Field (slug) | Type | Required | Label | Settings |
| --- | --- | --- | --- | --- |
| `Task` | `lookup_normal` → `task` | no | Task | single; the slug starts with a capital `T` |

Fields of the built-in Object the app reads or writes (nothing to create):

| Field (slug) | Type | How the app uses it |
| --- | --- | --- |
| `name` | `short_text` | subject; a note is saved with `name: ""` (the key must be present) |
| `activity_type` | `single_choice` | `note`, `task`, `call`, `meeting`, `email`, `sms`, `chat`, `facebook_comment`, `chat_zalo_fb`; notes are written as `note` |
| `note_type` | `single_choice` | written as `normal` |
| `content` | `long_text` (rich) | the note. You need its **ID** |
| `activity_time` | `date_time` | shown as the time of the activity |
| `files` | `file` (multiple) | shown as download chips |
| `source_object`, `source_record` | `short_text` | written as `task` and the task ID |
| `manual_log` | `boolean` | written as `1` |
| `_attachments` | `file` (system) | pictures pasted into a note. You need its **ID** |

---

## 3. `notes_cat` — Notes folder / Thư mục ghi chú

Record name: `name` (`short_text`).

| Field (slug) | Type | Required | Label (EN / VI) | Settings |
| --- | --- | --- | --- | --- |
| `name` | `short_text` | yes | Title / Tiêu đề | up to 255 characters |
| `parent_folder` | `lookup_normal` → `notes_cat` | no | Parent folder / Thư mục cha | single |
| `owner` | `lookup_normal` → `personnel` | yes | Owner / Người sở hữu | single |

## 4. `notes_content` — Note / Ghi chú

Record name: `name` (`short_text`).

| Field (slug) | Type | Required | Label (EN / VI) | Settings |
| --- | --- | --- | --- | --- |
| `name` | `short_text` | yes | Title / Tiêu đề | up to 255 characters |
| `folder` | `lookup_normal` → `notes_cat` | no | Folder / Thư mục | single |
| `owner` | `lookup_normal` → `personnel` | yes | Owner / Người sở hữu | single |
| `content` | `long_text` | no | Content / Nội dung | **three formats** enabled: `text_types` `[1, 2, 3]` (plain, rich text, Markdown), up to 65,000 characters |
| `visibility` | `single_choice` | yes | Visibility / Tình trạng chia sẻ | `private` (default), `shared`, `public` |
| `viewers` | `lookup_normal` → `personnel` | no | Viewers / Người được xem | multiple |
| `editors` | `lookup_normal` → `personnel` | no | Editors / Người được sửa | multiple |
| `viewer_departments` | `lookup_normal` → `department` | no | Viewer departments / Phòng được xem | multiple |
| `editor_departments` | `lookup_normal` → `department` | no | Editor departments / Phòng được sửa | multiple |
| `tags` | `lookup_normal` → `notes_tag` | no | Tags / Thẻ | multiple, up to 20 |

Because `content` has several formats, it is read and written as `{"text_type": 1 | 2 | 3, "value": "…"}`.

## 5. `notes_tag` — Notes tag / Thẻ ghi chú

| Field (slug) | Type | Required | Label (EN / VI) |
| --- | --- | --- | --- |
| `name` | `short_text` | yes | Name / Tên thẻ |

## 6. `notes_pin` — Notes pin / Ghim ghi chú

Record name: `name`, auto number `NPI-0000`.

| Field (slug) | Type | Required | Label (EN / VI) | Settings |
| --- | --- | --- | --- | --- |
| `name` | `auto_number` | yes | Code / Mã | prefix `NPI-`, format `0000` |
| `person` | `lookup_normal` → `personnel` | yes | Person / Người ghim | single |
| `note` | `reference` → `notes_content` | yes | Note / Ghi chú | a **reference**, so deleting a note deletes its pins |
| `order` | `numeric` | no | Order / Thứ tự | integer, 0–100,000 |

---

## 7. `user_settings` — User Setting / Thiết lập cá nhân

One record per person; whose it is = `created_by` (there is no owner field). Record name: `name`, auto number `UST-00000`.

| Field (slug) | Type | Required | Label (EN / VI) | Settings |
| --- | --- | --- | --- | --- |
| `name` | `auto_number` | yes | Setting ID / Mã thiết lập | prefix `UST-`, format `00000` |
| `desktop_wallpaper` | `file` | no | Desktop wallpaper / Ảnh nền Desktop | **single** file (limit 0–1), image group, types jpg, jpeg, png, webp, 20 MB, private, resizable |

---

## 8. Built-in Objects the apps read

Nothing to create; listed so you know what the signed-in user must be allowed to read.

| Object | Fields read | Used for |
| --- | --- | --- |
| `personnel` | `id`, `first_name`, `last_name`, `avatar`, `status`, `work_status`, `account_email`, `first_last_name`, `last_first_name`, `deleted` | the current user (`$currentUser`), the people pickers (status `ACTIVE`), the "@" list in notes |
| `department` | `id`, `name`, `is_active`, `deleted` | sharing a note with a department (only active, not deleted ones) |
| `department_personnel` | `personnel`, `department` | the departments I belong to |

---

## IDs to configure

Most requests use slugs, but writes and uploads need IDs. Put them in `app/src/workspaces.ts`, one set per hostname:

| Key in `workspaces.ts` | What it is |
| --- | --- |
| `workspaceId` | ID of the Workspace (`WS…`) |
| `task` | Object ID of `task` (`OT…`) |
| `taskImages` | field ID of `task._attachments` (`OF…`) |
| `taskDescription` | field ID of `task.description` |
| `taskStatus` | field ID of `task.status` (to find the transition rule) |
| `activity` | Object ID of `activity` |
| `activityImages` | field ID of `activity._attachments` |
| `activityContent` | field ID of `activity.content` |
| `notes.folder`, `notes.note`, `notes.tag`, `notes.pin` | Object IDs of `notes_cat`, `notes_content`, `notes_tag`, `notes_pin` |
| `settings` | Object ID of `user_settings` |
| `taskViewLayout` | ID of the detail layout of `task` (`LO…`) |

`taskViewLayout` is part of the link stored in an @mention, so the notification opens the task.

Object and field IDs are shown in the Object settings of your Workspace; the Objects API (`POST /bapi/v1/objects/list` with `includeFields: true`, authenticated with a Workspace API key) returns them too, along with the Workspace ID. The layout ID is the `layoutId` parameter in links to a task's detail page.

## Permissions

The app only hides what a user may not do; the Workspace enforces the rest.

- Give the users' Role view / create / edit / delete on `task`, `activity` (the app adds, edits and deletes the user's own notes there), `notes_cat`, `notes_content`, `notes_tag`, `notes_pin` and `user_settings`, and the right to read `personnel`, `department` and `department_personnel`.
- Recommended security rules for `notes_cat`, `notes_content`, `notes_pin` and `user_settings`: anyone may create; view / edit / delete only the records they created. With only these rules, sharing a note has no effect for other people — add view / edit rules based on `visibility`, `viewers`, `editors` and the department lists if you want sharing to work.
- In Tasks, a user sees the tasks where they are the assignee, the reporter or a follower (`ccs`); the filter is sent by the app, so restrict the Object further with security rules if tasks are confidential.

## Check your setup

1. Open the module in your Workspace: the task list loads without an error.
2. Create a task with a pasted picture and an attachment, then open it: the picture and the file are there.
3. Add a note with an @mention in the timeline.
4. In Notes, create a folder, a note in each of the three formats, a tag and a pin.
5. In Settings, upload a wallpaper and reload the page.

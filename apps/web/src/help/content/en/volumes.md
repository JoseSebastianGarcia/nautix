# Volumes: browse, download and upload

A volume is where a container keeps data that must survive it being recreated: a database, uploads, certificates. In **Resources, Volumes** the folder icon opens the files of a volume.

![A volume opened in the file browser, with download and upload](img:volumes)

## Browse

Folders open on click and text files show their first megabyte. Nautix mounts the volume in a short-lived helper container with no network and removes it when it is done, so nothing stays behind.

## Download

- **Download this folder** gives you the current folder as a `.tar` file.
- The arrow at the end of a row downloads that file or folder.
- Inside a file, **Download** gives you that file in a `.tar`.

A `.tar` keeps names and permissions. Open it with your system's tools (`tar -xf name.tar`, or any archive program).

## Upload

**Upload files** adds the files you choose to the folder you are looking at. Before anything happens you see the list, the destination and what to watch for:

- Files with the same name in that folder are **replaced**.
- The files are created owned by **root**. If the app that uses the volume runs as another user (databases usually do), it may not be able to read or change them.
- If a **container uses the volume**, changing files under a running app, a database above all, can corrupt its data. Stop it first.
- The limit is 256 MB per upload and file names up to 100 bytes.

The volume that holds Nautix's own data cannot be uploaded into: its database and its encryption key must not be overwritten from the interface that depends on them.

## Who can do it and what is recorded

Only admins. Every download and upload leaves an entry in the [audit log](help:audit) with the volume and the folder, never the content.

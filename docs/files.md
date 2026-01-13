---
title: Files
seotitle: Access Server Files in Warlock
description: Information about accessing and managing server files within Warlock Game Server Manager
order: 14
sidebar:
  - widget: cms-pagelist
    type: pages
    layout: widgets/pages-nav-sidebar
    permalink: "~ /projects/warlock/.*"
    sort: order
---

# Warlock File Manager

Warlock provides a web-based file manager for accessing and managing game server files.

## Select Host / Application

Clicking on "Files" in the navigation will show a list of server hosts in your cluster,
the games installed on each host, and filesystem mounts on each host.

![Warlock File Chooser](media/warlock-files.webp)

Clicking on a directory or game will open the file manager for that location on the target host.

## File Manager

The file manager is an advanced utility that provides a web-based interface for browsing, uploading, downloading,
and managing files on the target host.

![Warlock File Manager](media/warlock-host-files.webp)

The file manager provides the following features:

* Create directory
* Create file
* Upload file
* Extract archive (zip, tar, tar.gz, tar.bz2)
* Download file
* Rename file/directory
* Delete file/directory
* View file contents (text files)
* Edit file contents (text files)
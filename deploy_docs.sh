#!/bin/bash
#
# Simple script to deploy docs to the web location

if [ ! -e ".env" ]; then
	echo "Error: .env file not found. Please create it with the required variables"
	echo " and run this script from the project root directory."
	exit 1
fi

SITE_LOC="$(grep '^SITE_LOC=' .env | cut -d '=' -f2-)"
if [ -z "$SITE_LOC" ]; then
	echo "Error: SITE_LOC variable not set in .env file."
	echo "Please set it to the desired deployment location."
	exit 1
fi

echo "Deploying documentation to $SITE_LOC ..."
[ -d "$SITE_LOC" ] || mkdir -p "$SITE_LOC"
rsync -av --delete docs/ "$SITE_LOC/"
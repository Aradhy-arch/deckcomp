#!/usr/bin/env bash
# Nautilus/Nemo/Caja context menu script for DeckComp
for item in "$@"; do
    if [ -f "$item" ]; then
        deck-send "$item"
    fi
done

#!/usr/bin/env python3
"""
Migration script to add categories support to playlists.
Creates categories table and adds category_id column to playlists table.
"""

import sqlite3
import sys
from pathlib import Path

def migrate():
    # Try multiple possible database locations
    possible_paths = [
        Path(__file__).parent / 'youtube_downloader.db',  # Same directory
        Path(__file__).parent / 'data' / 'youtube_downloader.db',  # In data subfolder
    ]

    db_path = None
    for path in possible_paths:
        if path.exists():
            db_path = path
            break

    if not db_path:
        print(f"Database not found at any of these locations:")
        for path in possible_paths:
            print(f"  - {path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        print("Starting migration: Adding categories support...")

        # Check if categories table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'")
        if cursor.fetchone():
            print("✓ Categories table already exists")
        else:
            # Create categories table
            print("Creating categories table...")
            cursor.execute('''
                CREATE TABLE categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            print("✓ Categories table created")

        # Check if category_id column exists in playlists
        cursor.execute("PRAGMA table_info(playlists)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'category_id' in columns:
            print("✓ category_id column already exists in playlists table")
        else:
            # Add category_id column to playlists table
            print("Adding category_id column to playlists table...")
            cursor.execute('''
                ALTER TABLE playlists
                ADD COLUMN category_id INTEGER REFERENCES categories(id)
            ''')

            # Create index on category_id
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS ix_playlists_category_id
                ON playlists(category_id)
            ''')
            print("✓ category_id column added and indexed")

        conn.commit()
        print("\n✅ Migration completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()

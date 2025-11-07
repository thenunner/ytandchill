#!/usr/bin/env python3
"""
Test authentication flow
"""

from models import init_db, Setting
from werkzeug.security import check_password_hash

# Initialize database connection
engine, Session = init_db()
session = Session()

try:
    print("=" * 50)
    print("AUTHENTICATION TEST")
    print("=" * 50)

    # Get stored credentials
    username_setting = session.query(Setting).filter_by(key='auth_username').first()
    password_setting = session.query(Setting).filter_by(key='auth_password_hash').first()
    first_run = session.query(Setting).filter_by(key='first_run').first()

    print(f"\n1. Database Settings:")
    print(f"   Username: {username_setting.value if username_setting else 'NOT FOUND'}")
    print(f"   Password Hash: {'EXISTS' if password_setting else 'NOT FOUND'}")
    print(f"   First Run: {first_run.value if first_run else 'NOT FOUND'}")

    if username_setting and password_setting:
        # Test password validation
        test_password = 'admin'
        print(f"\n2. Testing Password Validation:")
        print(f"   Testing password: '{test_password}'")
        is_valid = check_password_hash(password_setting.value, test_password)
        print(f"   Result: {'✓ VALID' if is_valid else '✗ INVALID'}")

        print(f"\n3. Expected Login Flow:")
        print(f"   - Username to enter: {username_setting.value}")
        print(f"   - Password to enter: {test_password}")
        print(f"   - Should work: {'YES' if is_valid else 'NO'}")

    print("\n" + "=" * 50)
    print("TEST COMPLETE")
    print("=" * 50)

except Exception as e:
    print(f"✗ Error: {e}")
finally:
    session.close()

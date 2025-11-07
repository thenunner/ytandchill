from models import init_db, Setting

engine, Session = init_db()
session = Session()

try:
    # Delete all auth settings
    session.query(Setting).filter(Setting.key.in_(['auth_username', 'auth_password_hash', 'first_run'])).delete(synchronize_session=False)
    session.commit()
    print("✓ All auth settings cleared from database")
    print("✓ App will now show setup page on first load")
except Exception as e:
    session.rollback()
    print(f"✗ Error: {e}")
finally:
    session.close()

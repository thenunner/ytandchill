from models import init_db, Setting, get_session

engine, Session = init_db()

try:
    with get_session(Session) as session:
        # Delete all auth settings
        session.query(Setting).filter(Setting.key.in_(['auth_username', 'auth_password_hash', 'first_run'])).delete(synchronize_session=False)
        print("✓ All auth settings cleared from database")
        print("✓ App will now show setup page on first load")
except Exception as e:
    print(f"✗ Error: {e}")

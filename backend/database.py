from sqlalchemy import create_engine, Column, Integer, BigInteger, String, Float, Boolean, DateTime, ForeignKey, Text, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash
from contextlib import contextmanager
import os

Base = declarative_base()

class Channel(Base):
    __tablename__ = 'channels'
    
    id = Column(Integer, primary_key=True)
    yt_id = Column(String(100), unique=True, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    thumbnail = Column(String(500))
    folder_name = Column(String(200), nullable=False)
    min_minutes = Column(Integer, default=0)
    max_minutes = Column(Integer, default=0)  # 0 means no limit
    auto_download = Column(Boolean, default=False)  # Auto-queue new videos during scan
    last_scan_at = Column(DateTime)  # Upload date of most recent video found
    last_scan_time = Column(DateTime)  # When the scan actually executed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete: NULL = active, set = deleted
    last_visited_at = Column(DateTime, nullable=True)  # Last time user visited this channel in Library
    category_id = Column(Integer, ForeignKey('channel_categories.id'), nullable=True, index=True)

    videos = relationship('Video', back_populates='channel')
    playlists = relationship('Playlist', back_populates='channel', cascade='all, delete-orphan')
    category = relationship('ChannelCategory', back_populates='channels')

class Video(Base):
    __tablename__ = 'videos'

    id = Column(Integer, primary_key=True)
    yt_id = Column(String(100), unique=True, nullable=False, index=True)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=True, index=True)  # Nullable for playlist videos
    title = Column(String(300), nullable=False)
    duration_sec = Column(Integer, nullable=False)
    upload_date = Column(String(20))  # YYYYMMDD format from yt-dlp
    thumb_url = Column(String(500))
    file_path = Column(String(500))
    file_size_bytes = Column(Integer)
    status = Column(String(20), default='discovered', index=True)  # discovered, queued, downloading, library, ignored, geoblocked, shorts, not_found
    watched = Column(Boolean, default=False, index=True)
    playback_seconds = Column(Integer, default=0)
    discovered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    downloaded_at = Column(DateTime)
    folder_name = Column(String(200), nullable=True)  # For playlist videos (when channel_id is NULL)

    channel = relationship('Channel', back_populates='videos')
    queue_items = relationship('QueueItem', back_populates='video', cascade='all, delete-orphan')
    playlist_videos = relationship('PlaylistVideo', back_populates='video', cascade='all, delete-orphan')

class Category(Base):
    """Category for organizing playlists in the Library tab."""
    __tablename__ = 'categories'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    playlists = relationship('Playlist', back_populates='category')


class ChannelCategory(Base):
    """Category for organizing channels in the Channels tab (separate from playlist categories)."""
    __tablename__ = 'channel_categories'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    channels = relationship('Channel', back_populates='category')

class Playlist(Base):
    __tablename__ = 'playlists'

    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey('channels.id'), index=True)
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    channel = relationship('Channel', back_populates='playlists')
    category = relationship('Category', back_populates='playlists')
    playlist_videos = relationship('PlaylistVideo', back_populates='playlist', cascade='all, delete-orphan')

class PlaylistVideo(Base):
    __tablename__ = 'playlist_videos'
    
    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey('playlists.id'), nullable=False, index=True)
    video_id = Column(Integer, ForeignKey('videos.id'), nullable=False, index=True)
    position = Column(Integer, default=0)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    playlist = relationship('Playlist', back_populates='playlist_videos')
    video = relationship('Video', back_populates='playlist_videos')

class QueueItem(Base):
    __tablename__ = 'queue_items'

    id = Column(Integer, primary_key=True)
    video_id = Column(Integer, ForeignKey('videos.id'), nullable=False, index=True)
    queue_position = Column(Integer, nullable=True, index=True)  # Position in queue for ordering
    status = Column(String(20), default='pending', index=True)  # pending, downloading, paused, completed, failed, cancelled
    prior_status = Column(String(20), nullable=True)  # Video's status before queueing (discovered, ignored, removed, NULL)
    progress_pct = Column(Float, default=0.0)
    speed_bps = Column(Float, default=0.0)
    eta_seconds = Column(Integer, default=0)
    total_bytes = Column(BigInteger, default=0)  # File size in bytes
    log = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    video = relationship('Video', back_populates='queue_items')

class Setting(Base):
    __tablename__ = 'settings'
    
    key = Column(String(100), primary_key=True)
    value = Column(Text)

def init_db(database_url=None):
    if database_url is None:
        data_dir = os.environ.get('DATA_DIR', 'data')
        database_url = f'sqlite:///{os.path.join(data_dir, "youtube_downloader.db")}'
    engine = create_engine(database_url, echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    # Run migrations for new columns on existing tables
    with engine.connect() as conn:
        # Check if last_visited_at column exists in channels table
        result = conn.execute(text("PRAGMA table_info(channels)"))
        columns = [row[1] for row in result]
        if 'last_visited_at' not in columns:
            conn.execute(text("ALTER TABLE channels ADD COLUMN last_visited_at DATETIME"))
            conn.commit()

    # Initialize default settings including auth credentials
    session = Session()
    try:
        # Check if auth settings exist
        if not session.query(Setting).filter_by(key='auth_username').first():
            # Set default admin credentials
            session.add(Setting(key='auth_username', value='admin'))
            session.add(Setting(key='auth_password_hash', value=generate_password_hash('admin')))
            session.add(Setting(key='first_run', value='true'))
            session.commit()
    finally:
        session.close()

    return engine, Session

@contextmanager
def get_session(session_factory):
    """
    Context manager for database sessions with automatic commit/rollback/cleanup.

    Usage:
        with get_session(session_factory) as session:
            # Do database operations
            channel = session.query(Channel).first()
            # Automatic commit on success, rollback on exception

    Args:
        session_factory: SQLAlchemy session factory (sessionmaker instance)

    Yields:
        session: Database session object
    """
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

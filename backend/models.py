from sqlalchemy import create_engine, Column, Integer, BigInteger, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash

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
    last_scan_at = Column(DateTime)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    videos = relationship('Video', back_populates='channel', cascade='all, delete-orphan')
    playlists = relationship('Playlist', back_populates='channel', cascade='all, delete-orphan')

class Video(Base):
    __tablename__ = 'videos'
    
    id = Column(Integer, primary_key=True)
    yt_id = Column(String(100), unique=True, nullable=False, index=True)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    duration_sec = Column(Integer, nullable=False)
    upload_date = Column(String(20))  # YYYYMMDD format from yt-dlp
    thumb_url = Column(String(500))
    file_path = Column(String(500))
    file_size_bytes = Column(Integer)
    status = Column(String(20), default='discovered', index=True)  # discovered, ignored, geoblocked, queued, downloading, library
    watched = Column(Boolean, default=False, index=True)
    playback_seconds = Column(Integer, default=0)
    discovered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    downloaded_at = Column(DateTime)
    
    channel = relationship('Channel', back_populates='videos')
    queue_items = relationship('QueueItem', back_populates='video', cascade='all, delete-orphan')
    playlist_videos = relationship('PlaylistVideo', back_populates='video', cascade='all, delete-orphan')

class Playlist(Base):
    __tablename__ = 'playlists'
    
    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey('channels.id'), index=True)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    channel = relationship('Channel', back_populates='playlists')
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

def init_db(database_url='sqlite:///data/youtube_downloader.db'):
    engine = create_engine(database_url, echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

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

def get_session(Session):
    return Session()

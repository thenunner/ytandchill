"""
Event bus for Server-Sent Events (SSE) broadcasting.
Allows the download worker to emit events that get pushed to connected clients.
"""
from queue import Queue, Full
from threading import Lock
import logging

logger = logging.getLogger(__name__)

# Max events to buffer per subscriber before dropping
MAX_QUEUE_SIZE = 100


class EventBus:
    """Thread-safe event bus for SSE subscribers."""

    def __init__(self):
        self.subscribers = []
        self.lock = Lock()

    def subscribe(self):
        """Create a new subscriber queue with bounded size."""
        q = Queue(maxsize=MAX_QUEUE_SIZE)
        with self.lock:
            self.subscribers.append(q)
            logger.debug(f"SSE subscriber added. Total: {len(self.subscribers)}")
        return q

    def unsubscribe(self, q):
        """Remove a subscriber queue."""
        with self.lock:
            if q in self.subscribers:
                self.subscribers.remove(q)
                logger.debug(f"SSE subscriber removed. Total: {len(self.subscribers)}")

    def emit(self, event_type, data=None):
        """Broadcast an event to all subscribers."""
        event = {'type': event_type, 'data': data}

        # Take snapshot of subscribers under lock to avoid race conditions
        with self.lock:
            subscribers_snapshot = list(self.subscribers)

        # Emit outside lock to avoid blocking
        dropped_count = 0
        for q in subscribers_snapshot:
            try:
                q.put_nowait(event)
            except Full:
                dropped_count += 1

        if dropped_count > 0:
            logger.warning(f"SSE: Dropped event for {dropped_count} subscriber(s) (queue full)")

    @property
    def subscriber_count(self):
        """Return current number of subscribers."""
        with self.lock:
            return len(self.subscribers)


# Global event bus instance for queue updates
queue_events = EventBus()

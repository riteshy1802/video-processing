"""Legacy Kafka thumbnail worker (inactive).

Thumbnail generation now runs as an auxiliary planner-triggered service in
``app.services.thumbnail_service``. This package is intentionally retained for
possible later reuse, but it is not imported by the application or Makefile.
"""

import asyncio
import logging
import signal


def install_shutdown_handlers(
    shutdown_event: asyncio.Event,
    logger: logging.Logger,
) -> None:
    """Translate SIGTERM/SIGINT into cooperative asyncio shutdown."""
    loop = asyncio.get_running_loop()

    def request_shutdown(signal_name: str) -> None:
        if shutdown_event.is_set():
            return
        logger.info("Received %s; stopping after current safe boundary", signal_name)
        shutdown_event.set()

    for watched_signal in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(
                watched_signal,
                request_shutdown,
                watched_signal.name,
            )
        except NotImplementedError:
            # add_signal_handler is available on the Linux deployment target.
            # Keep non-POSIX development environments functional.
            pass


async def wait_for_shutdown(
    shutdown_event: asyncio.Event,
    timeout_seconds: float,
) -> bool:
    """Wait for shutdown up to timeout_seconds; return True when requested."""
    try:
        await asyncio.wait_for(shutdown_event.wait(), timeout=timeout_seconds)
        return True
    except asyncio.TimeoutError:
        return False

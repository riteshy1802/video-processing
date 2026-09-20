import asyncio
import logging

from app.config import settings
from app.core.shutdown import install_shutdown_handlers, wait_for_shutdown
from app.database import AsyncSessionLocal
from app.services.pipeline_reconciler import reconcile_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("pipeline_reconciler")


async def main_async() -> None:
    shutdown_event = asyncio.Event()
    install_shutdown_handlers(shutdown_event, logger)
    logger.info("Pipeline reconciler started")

    while not shutdown_event.is_set():
        try:
            async with AsyncSessionLocal() as db:
                result = await reconcile_pipeline(db)
            if any(
                (
                    result.expired_chunks_recovered,
                    result.expired_chunks_cancelled,
                    result.rendition_jobs_queued,
                    result.video_jobs_queued,
                    result.transitional_videos_settled,
                )
            ):
                logger.info(
                    "Reconciled pipeline: expired_requeued=%s expired_cancelled=%s rendition_jobs=%s video_jobs=%s terminal_settlements=%s",
                    result.expired_chunks_recovered,
                    result.expired_chunks_cancelled,
                    result.rendition_jobs_queued,
                    result.video_jobs_queued,
                    result.transitional_videos_settled,
                )
        except Exception:
            logger.exception("Pipeline reconciliation pass failed")

        await wait_for_shutdown(
            shutdown_event,
            settings.RECONCILER_INTERVAL_SECONDS,
        )

    logger.info("Pipeline reconciler stopped")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()

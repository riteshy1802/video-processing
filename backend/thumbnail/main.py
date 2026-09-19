# import logging
# import asyncio
# from kafka import TopicPartition

# from thumbnail.consumer import create_thumbnail_consumer
# from thumbnail.generate_thumbnail import process_thumbnail

# logging.basicConfig(
#     level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
# )
# logging.getLogger("kafka").setLevel(logging.WARNING)
# logger = logging.getLogger("thumbnail_main")


# async def main_async():
#     consumer = create_thumbnail_consumer()
#     logger.info("Thumbnail consumer started. Waiting for jobs...")

#     try:
#         for message in consumer:
#             video_id = (
#                 message.value.get("video_id")
#                 if isinstance(message.value, dict)
#                 else str(message.value)
#             )
#             logger.info(
#                 f"Processing job: video_id={video_id} | partition={message.partition} | offset={message.offset}"
#             )
#             try:
#                 thumbnail_key = await process_thumbnail(video_id)
#                 consumer.commit()
#                 logger.info(
#                     "Thumbnail job completed and offset committed: video_id=%s key=%s",
#                     video_id,
#                     thumbnail_key,
#                 )
#             except Exception:
#                 logger.exception(
#                     "Thumbnail generation failed video_id=%s; offset was not committed",
#                     video_id,
#                 )
#                 failed_partition = TopicPartition(message.topic, message.partition)
#                 consumer.seek(failed_partition, message.offset)
#                 logger.warning(
#                     "Scheduled thumbnail job retry: video_id=%s partition=%s offset=%s",
#                     video_id,
#                     message.partition,
#                     message.offset,
#                 )
#                 await asyncio.sleep(5)

#             # IMPORTANT:
#             # don't commit failed work yet
#     except KeyboardInterrupt:
#         logger.info("Thumbnail consumer shutting down gracefully...")
#     finally:
#         consumer.close()


# def main():
#     asyncio.run(main_async())


# if __name__ == "__main__":
#     main()

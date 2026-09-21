"""Thumbnail Kafka consumption is currently disabled.

If it is re-enabled, use app.core.kafka_consumer.KafkaConsumerThread so it
shares the same Confluent/KIP-848 coordination and settlement semantics.
"""

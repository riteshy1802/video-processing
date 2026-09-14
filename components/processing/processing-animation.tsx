"use client";

import { Video } from "@/types/video";
import { KafkaArchitectureDiagram } from "./kafka-architecture-diagram";

interface ProcessingAnimationProps {
  video: Video;
}

export function ProcessingAnimation({ video }: ProcessingAnimationProps) {
  return <KafkaArchitectureDiagram video={video} />;
}

import type { SpriteAnimationAsset } from "./visualAssets";

type SpriteAnimationProps = {
  animation: SpriteAnimationAsset;
  alt: string;
  currentTime: number;
  className?: string;
};

function SpriteAnimation({
  animation,
  alt,
  currentTime,
  className,
}: SpriteAnimationProps) {
  if (animation.frames.length === 0) {
    return null;
  }

  const frameIndex =
    Math.floor(currentTime / animation.frameDurationMs) %
    animation.frames.length;

  return (
    <img
      alt={alt}
      className={className}
      draggable={false}
      src={animation.frames[frameIndex]}
    />
  );
}

export default SpriteAnimation;

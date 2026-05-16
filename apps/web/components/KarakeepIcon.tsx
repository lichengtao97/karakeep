import Image from "next/image";

export default function KarakeepLogo({ height }: { height: number }) {
  const iconSize = Math.max(24, Math.round(height * 0.55));
  const fontSize = Math.max(20, Math.round(height * 0.33));

  return (
    <span className="flex items-center gap-2 font-semibold text-foreground">
      <Image
        src="/icons/logo-128.png"
        alt=""
        aria-hidden="true"
        className="shrink-0"
        width={128}
        height={128}
        style={{ height: iconSize, width: iconSize }}
      />
      <span style={{ fontSize, lineHeight: `${height}px` }}>AI Lens</span>
    </span>
  );
}

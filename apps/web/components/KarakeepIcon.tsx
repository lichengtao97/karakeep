import Image from "next/image";

export default function KarakeepLogo({ height }: { height: number }) {
  const fontSize = Math.max(20, Math.round(height * 0.33));
  const iconHeight = Math.max(18, Math.round(fontSize * 1.15));
  const iconWidth = Math.round(iconHeight * 1.62);

  return (
    <span className="flex items-center gap-2 font-semibold text-foreground">
      <Image
        src="/icons/logo-mark.png"
        alt=""
        aria-hidden="true"
        className="shrink-0"
        width={324}
        height={200}
        style={{ height: iconHeight, width: iconWidth }}
      />
      <span style={{ fontSize, lineHeight: `${height}px` }}>AI Lens</span>
    </span>
  );
}

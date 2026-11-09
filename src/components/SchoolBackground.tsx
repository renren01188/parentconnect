import Image from "next/image";

/**
 * The shared public banner image used by every login journey. It intentionally
 * matches the landing, About, and Contact page banners.
 */
export function SchoolBackground() {
  return (
    <Image
      src="/hero-school-4.png"
      alt=""
      aria-hidden="true"
      fill
      priority
      sizes="100vw"
      quality={75}
      className="object-cover object-center"
    />
  );
}

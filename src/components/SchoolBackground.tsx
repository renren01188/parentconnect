import Image from "next/image";

const SCHOOL_BACKGROUND_URL = "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80";

/**
 * A shared, responsive school image for public pages. Using next/image lets
 * Vercel serve an appropriately sized, cached image instead of every browser
 * downloading the same CSS background at its original size.
 */
export function SchoolBackground() {
  return (
    <Image
      src={SCHOOL_BACKGROUND_URL}
      alt=""
      aria-hidden="true"
      fill
      priority
      sizes="100vw"
      className="object-cover object-center"
    />
  );
}

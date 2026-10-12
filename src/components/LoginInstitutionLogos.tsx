import Image from "next/image";

type LoginInstitutionLogosProps = {
  className?: string;
};

export function LoginInstitutionLogos({ className = "" }: LoginInstitutionLogosProps) {
  return (
    <div className={`flex items-center gap-4 shrink-0 ${className}`}>
      <div className="flex flex-col items-center">
        <Image
          src="/deped-logo.png"
          alt="Department of Education seal"
          width={56}
          height={56}
          className="h-14 w-14 object-contain drop-shadow-md"
        />
        <span className="mt-1 text-center text-[9px] text-white/60">DEPARTMENT OF<br />EDUCATION</span>
      </div>
      <div className="flex flex-col items-center">
        <Image
          src="/icon.png"
          alt="Santiago Elementary School seal"
          width={56}
          height={56}
          className="h-14 w-14 object-contain drop-shadow-md"
        />
        <span className="mt-1 text-center text-[9px] text-white/60">SANTIAGO<br />ELEM. SCHOOL</span>
      </div>
    </div>
  );
}

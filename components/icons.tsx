import type { ReactNode, SVGProps } from "react";

/** Iconos de trazo, rejilla 24, estilo consistente. `size` en px. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const BrainIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.5V15a3 3 0 0 0 4 2.8A3 3 0 0 0 12 19V5a2 2 0 0 0-2-2Z" />
    <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.5V15a3 3 0 0 1-4 2.8A3 3 0 0 1 12 19" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.7}>
    <path d="M4 12l16-7-7 16-2-7-7-2Z" />
  </Svg>
);

export const PaperclipIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 12l6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8" />
  </Svg>
);

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6Z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);

export const DocIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v5h5" />
  </Svg>
);

export const ReceiptIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21Z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.8}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="M5 12l4 4 10-10" />
  </Svg>
);

export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 5.5l3 3L8 19H5v-3Z" />
    <path d="M13.5 7.5l3 3" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10a8 8 0 0 1 14-4l2 2M20 14a8 8 0 0 1-14 4l-2-2" />
    <path d="M18 4v4h-4M6 20v-4h4" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M5 20h14" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);

export const SpinnerIcon = ({ size = 16, className = "", ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={`animate-spin ${className}`}
    {...rest}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/** Icono por categoría. */
export function CategoryIcon({ category, size = 17 }: { category: string; size?: number }) {
  switch (category) {
    case "Seguros":
      return <ShieldIcon size={size} />;
    case "Contratos de alquiler":
      return <HomeIcon size={size} />;
    case "Recibos":
      return <ReceiptIcon size={size} />;
    case "Contratos":
    case "Documentos e IDs":
    case "PDFs":
      return <DocIcon size={size} />;
    default:
      return <FolderIcon size={size} />;
  }
}

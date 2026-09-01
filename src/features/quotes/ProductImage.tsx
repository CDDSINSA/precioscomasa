import { Camera } from "lucide-react";
import { useEffect, useState } from "react";

type ProductImageProps = {
  alt?: string;
  src?: string;
};

export function ProductImage({ alt = "Imagen de producto", src }: ProductImageProps) {
  const [hasError, setHasError] = useState(!src);

  useEffect(() => {
    setHasError(!src);
  }, [src]);

  if (hasError) {
    return (
      <span className="product-image-fallback" role="img" aria-label="Imagen no disponible" title="Imagen no disponible">
        <Camera size={20} aria-hidden="true" />
      </span>
    );
  }

  return <img className="product-image" src={src} alt={alt} loading="lazy" onError={() => setHasError(true)} />;
}

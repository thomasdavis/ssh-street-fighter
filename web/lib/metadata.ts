import type { Metadata } from 'next';

export const SITE_NAME = 'SSH Fighter';
export const SITE_ORIGIN = 'https://sshfighter.com';
export const DEFAULT_SOCIAL_IMAGE = '/opengraph-image';
export const DEFAULT_SOCIAL_IMAGE_ALT = 'SSH Fighter — an arcade fighting game played entirely over SSH';

interface PageMetadataOptions {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  image?: string;
  imageAlt?: string;
  robots?: Metadata['robots'];
}

/**
 * Keep every public page consistent across search results, Open Graph cards,
 * X cards, and canonical URLs. Dynamic match pages can override the image.
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  image = DEFAULT_SOCIAL_IMAGE,
  imageAlt = DEFAULT_SOCIAL_IMAGE_ALT,
  robots,
}: PageMetadataOptions): Metadata {
  const images = [{ url: image, width: 1200, height: 630, alt: imageAlt, type: 'image/png' }];

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      url: path,
      title,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      creator: '@ajaxdavis',
      site: '@ajaxdavis',
      title,
      description,
      images: [{ url: image, alt: imageAlt }],
    },
    robots,
  };
}

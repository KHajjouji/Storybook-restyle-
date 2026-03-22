export interface TrimSize {
  id: string;
  trim_in: { w: number; h: number };
  interior_with_bleed_in: { w: number; h: number };
  page_count: {
    bw_white: { min: number; max: number } | null;
    bw_cream: { min: number; max: number } | null;
    standard_color_white: { min: number; max: number } | null;
    premium_color_white: { min: number; max: number } | null;
  };
}

export interface KDPPrintSystem {
  version: string;
  global_rules: {
    dpi: number;
    color_mode_default: string;
    interior_export_format: string;
    interior_export_pages: string;
    cover_export_format: string;
    embed_fonts: boolean;
    embed_color_profile: boolean;
    printer_marks: boolean;
    crop_marks: boolean;
    allow_internal_spread_design: boolean;
    final_interior_must_be_single_pages: boolean;
  };
  margin_rules: {
    without_bleed: { top_min_in: number; bottom_min_in: number; outside_min_in: number };
    with_bleed: { top_min_in: number; bottom_min_in: number; outside_min_in: number };
    inside_by_page_count_in: { min_pages: number; max_pages: number; inside_min_in: number }[];
    recommended_overlay_safe_padding_in: { top: number; bottom: number; outside: number; inside: number };
  };
  bleed_rules: {
    interior_bleed_addition_in: { width: number; height: number };
    cover_bleed_addition_in: { top: number; bottom: number; outside_edges: number };
    enable_bleed_if_any_edge_content: boolean;
  };
  paperback: {
    supported: boolean;
    page_count_even_required: boolean;
    custom_trim_allowed: boolean;
    custom_trim_constraints_in: { min_width: number; max_width: number; min_height: number; max_height: number };
    trim_presets: TrimSize[];
    ink_options: string[];
    expanded_distribution_flags: Record<string, Record<string, boolean>>;
  };
}

export const KDP_PRINT_SYSTEM: KDPPrintSystem = {
  version: "2026-01",
  global_rules: {
    dpi: 300,
    color_mode_default: "RGB",
    interior_export_format: "PDF_PRINT",
    interior_export_pages: "single_pages_only",
    cover_export_format: "PDF_PRINT",
    embed_fonts: true,
    embed_color_profile: true,
    printer_marks: false,
    crop_marks: false,
    allow_internal_spread_design: true,
    final_interior_must_be_single_pages: true
  },
  margin_rules: {
    without_bleed: { top_min_in: 0.25, bottom_min_in: 0.25, outside_min_in: 0.25 },
    with_bleed: { top_min_in: 0.375, bottom_min_in: 0.375, outside_min_in: 0.375 },
    inside_by_page_count_in: [
      { min_pages: 24, max_pages: 150, inside_min_in: 0.375 },
      { min_pages: 151, max_pages: 300, inside_min_in: 0.5 },
      { min_pages: 301, max_pages: 500, inside_min_in: 0.625 },
      { min_pages: 501, max_pages: 700, inside_min_in: 0.75 },
      { min_pages: 701, max_pages: 828, inside_min_in: 0.875 }
    ],
    recommended_overlay_safe_padding_in: { top: 0.5, bottom: 0.5, outside: 0.5, inside: 0.625 }
  },
  bleed_rules: {
    interior_bleed_addition_in: { width: 0.125, height: 0.25 },
    cover_bleed_addition_in: { top: 0.125, bottom: 0.125, outside_edges: 0.125 },
    enable_bleed_if_any_edge_content: true
  },
  paperback: {
    supported: true,
    page_count_even_required: true,
    custom_trim_allowed: true,
    custom_trim_constraints_in: { min_width: 4.0, max_width: 8.5, min_height: 6.0, max_height: 11.69 },
    trim_presets: [
      {
        id: "5x8",
        trim_in: { w: 5.0, h: 8.0 },
        interior_with_bleed_in: { w: 5.125, h: 8.25 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "5.06x7.81",
        trim_in: { w: 5.06, h: 7.81 },
        interior_with_bleed_in: { w: 5.185, h: 8.06 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "5.25x8",
        trim_in: { w: 5.25, h: 8.0 },
        interior_with_bleed_in: { w: 5.375, h: 8.25 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "5.5x8.5",
        trim_in: { w: 5.5, h: 8.5 },
        interior_with_bleed_in: { w: 5.625, h: 8.75 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "6x9",
        trim_in: { w: 6.0, h: 9.0 },
        interior_with_bleed_in: { w: 6.125, h: 9.25 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "6.14x9.21",
        trim_in: { w: 6.14, h: 9.21 },
        interior_with_bleed_in: { w: 6.265, h: 9.46 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "6.69x9.61",
        trim_in: { w: 6.69, h: 9.61 },
        interior_with_bleed_in: { w: 6.815, h: 9.86 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "7x10",
        trim_in: { w: 7.0, h: 10.0 },
        interior_with_bleed_in: { w: 7.125, h: 10.25 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "7.44x9.69",
        trim_in: { w: 7.44, h: 9.69 },
        interior_with_bleed_in: { w: 7.565, h: 9.94 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "7.5x9.25",
        trim_in: { w: 7.5, h: 9.25 },
        interior_with_bleed_in: { w: 7.625, h: 9.5 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "8x10",
        trim_in: { w: 8.0, h: 10.0 },
        interior_with_bleed_in: { w: 8.125, h: 10.25 },
        page_count: {
          bw_white: { min: 24, max: 828 },
          bw_cream: { min: 24, max: 776 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 828 }
        }
      },
      {
        id: "8.25x6",
        trim_in: { w: 8.25, h: 6.0 },
        interior_with_bleed_in: { w: 8.375, h: 6.25 },
        page_count: {
          bw_white: { min: 24, max: 800 },
          bw_cream: { min: 24, max: 750 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 800 }
        }
      },
      {
        id: "8.25x8.25",
        trim_in: { w: 8.25, h: 8.25 },
        interior_with_bleed_in: { w: 8.375, h: 8.5 },
        page_count: {
          bw_white: { min: 24, max: 800 },
          bw_cream: { min: 24, max: 750 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 800 }
        }
      },
      {
        id: "8.5x8.5",
        trim_in: { w: 8.5, h: 8.5 },
        interior_with_bleed_in: { w: 8.625, h: 8.75 },
        page_count: {
          bw_white: { min: 24, max: 590 },
          bw_cream: { min: 24, max: 550 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 590 }
        }
      },
      {
        id: "8.5x11",
        trim_in: { w: 8.5, h: 11.0 },
        interior_with_bleed_in: { w: 8.625, h: 11.25 },
        page_count: {
          bw_white: { min: 24, max: 590 },
          bw_cream: { min: 24, max: 550 },
          standard_color_white: { min: 72, max: 600 },
          premium_color_white: { min: 24, max: 590 }
        }
      },
      {
        id: "8.27x11.69",
        trim_in: { w: 8.27, h: 11.69 },
        interior_with_bleed_in: { w: 8.395, h: 11.94 },
        page_count: {
          bw_white: { min: 24, max: 780 },
          bw_cream: { min: 24, max: 730 },
          standard_color_white: null,
          premium_color_white: { min: 24, max: 590 }
        }
      }
    ],
    ink_options: [
      "bw_white",
      "bw_cream",
      "standard_color_white",
      "premium_color_white"
    ],
    expanded_distribution_flags: {
      "5x8": { bw_white: true, bw_cream: true, standard_color_white: false, premium_color_white: true },
      "5.06x7.81": { bw_white: true, bw_cream: false, standard_color_white: false, premium_color_white: true },
      "5.25x8": { bw_white: true, bw_cream: true, standard_color_white: false, premium_color_white: true },
      "5.5x8.5": { bw_white: true, bw_cream: true, standard_color_white: true, premium_color_white: true },
      "6x9": { bw_white: true, bw_cream: true, standard_color_white: true, premium_color_white: true },
      "6.14x9.21": { bw_white: true, bw_cream: false, standard_color_white: true, premium_color_white: true },
      "6.69x9.61": { bw_white: true, bw_cream: false, standard_color_white: false, premium_color_white: true },
      "7x10": { bw_white: true, bw_cream: false, standard_color_white: true, premium_color_white: true },
      "7.44x9.69": { bw_white: true, bw_cream: false, standard_color_white: false, premium_color_white: true },
      "7.5x9.25": { bw_white: true, bw_cream: false, standard_color_white: false, premium_color_white: true },
      "8x10": { bw_white: true, bw_cream: false, standard_color_white: true, premium_color_white: true },
      "8.25x6": { bw_white: false, bw_cream: false, standard_color_white: false, premium_color_white: false },
      "8.25x8.25": { bw_white: false, bw_cream: false, standard_color_white: false, premium_color_white: false },
      "8.5x8.5": { bw_white: false, bw_cream: false, standard_color_white: true, premium_color_white: true },
      "8.5x11": { bw_white: true, bw_cream: false, standard_color_white: true, premium_color_white: true }
    }
  }
};

export const getInsideMargin = (pageCount: number): number => {
  const rule = KDP_PRINT_SYSTEM.margin_rules.inside_by_page_count_in.find(
    r => pageCount >= r.min_pages && pageCount <= r.max_pages
  );
  return rule ? rule.inside_min_in : 0.375; // Default to minimum if not found
};

export const calculatePageWithBleed = (trimWidth: number, trimHeight: number, bleed: boolean = true) => {
  if (!bleed) return { width: trimWidth, height: trimHeight };
  return {
    width: trimWidth + KDP_PRINT_SYSTEM.bleed_rules.interior_bleed_addition_in.width,
    height: trimHeight + KDP_PRINT_SYSTEM.bleed_rules.interior_bleed_addition_in.height
  };
};

export const calculateSpreadWithBleed = (trimWidth: number, trimHeight: number, bleed: boolean = true) => {
  if (!bleed) return { width: trimWidth * 2, height: trimHeight };
  return {
    width: (trimWidth * 2) + (KDP_PRINT_SYSTEM.bleed_rules.interior_bleed_addition_in.width * 2),
    height: trimHeight + KDP_PRINT_SYSTEM.bleed_rules.interior_bleed_addition_in.height
  };
};

export const calculateSpineWidth = (pageCount: number, paperType: 'white' | 'cream' = 'white', colorType: 'bw' | 'standard_color' | 'premium_color' = 'standard_color') => {
  // Rough estimation based on KDP formulas
  // B&W white paper: 0.002252" per page
  // B&W cream paper: 0.0025" per page
  // Color paper: 0.002347" per page
  let multiplier = 0.002252;
  if (colorType === 'standard_color' || colorType === 'premium_color') {
    multiplier = 0.002347;
  } else if (paperType === 'cream') {
    multiplier = 0.0025;
  }
  return pageCount * multiplier;
};

export const calculateCoverWithBleed = (trimWidth: number, trimHeight: number, pageCount: number, paperType: 'white' | 'cream' = 'white', colorType: 'bw' | 'standard_color' | 'premium_color' = 'standard_color') => {
  const spine = calculateSpineWidth(pageCount, paperType, colorType);
  const bleed = KDP_PRINT_SYSTEM.bleed_rules.cover_bleed_addition_in.top; // 0.125
  return {
    width: (trimWidth * 2) + spine + (bleed * 2),
    height: trimHeight + (bleed * 2),
    spine
  };
};

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export const validateProjectForKDP = (
  pages: any[], 
  formatId: string, 
  pageCount: number, 
  inkType: string = 'standard_color_white'
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Check Trim Size Support
  const preset = KDP_PRINT_SYSTEM.paperback.trim_presets.find(p => p.id === formatId.replace('KDP_', ''));
  if (!preset && formatId.startsWith('KDP_')) {
    warnings.push(`Format ${formatId} is not a standard KDP preset. Custom sizes may have additional constraints.`);
  }

  // 2. Check Page Count Limits
  if (preset) {
    const limits = preset.page_count[inkType as keyof typeof preset.page_count];
    if (limits) {
      if (pageCount < limits.min) {
        errors.push(`Page count (${pageCount}) is below the minimum (${limits.min}) for this format and ink type.`);
      }
      if (pageCount > limits.max) {
        errors.push(`Page count (${pageCount}) exceeds the maximum (${limits.max}) for this format and ink type.`);
      }
    } else {
      errors.push(`Ink type ${inkType} is not supported for this trim size.`);
    }
  }

  // 3. Check Even Page Count
  if (KDP_PRINT_SYSTEM.paperback.page_count_even_required && pageCount % 2 !== 0) {
    errors.push(`KDP requires an even number of pages. Current count: ${pageCount}.`);
  }

  // 4. Check for Blank Pages (Warning)
  const blankPages = pages.filter(p => !p.originalImage && !p.originalText);
  if (blankPages.length > 2) {
    warnings.push(`Project contains ${blankPages.length} completely blank pages. KDP may reject books with excessive blank pages.`);
  }

  // 5. Check Image Resolution (Warning - assuming images might be upscaled later)
  const lowResPages = pages.filter(p => p.originalImage && p.originalImage.length < 100000); // Rough heuristic for low res base64
  if (lowResPages.length > 0) {
    warnings.push(`${lowResPages.length} pages may have low-resolution images. KDP requires 300 DPI for print.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

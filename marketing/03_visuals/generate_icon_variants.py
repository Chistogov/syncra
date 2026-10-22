import cv2
import numpy as np
from PIL import Image

def clean_alpha_key(rgb_path, black_thresh=0.02, power=0.85):
    """
    Extracts isolated glowing object from pure black background
    without dark fringing.
    """
    img = cv2.imread(rgb_path).astype(np.float32) / 255.0
    max_c = np.max(img, axis=2)
    
    # Calculate smooth alpha
    alpha = np.clip((max_c - black_thresh) / (1.0 - black_thresh), 0.0, 1.0)
    alpha = np.power(alpha, power)
    
    # Color recovery (un-premultiply)
    safe_alpha = np.maximum(alpha, 1e-4)
    unmult = np.zeros_like(img)
    for i in range(3):
        unmult[:, :, i] = np.clip(img[:, :, i] / (safe_alpha ** 0.55), 0.0, 1.0)
        
    bgra = np.dstack([
        (unmult[:, :, 0] * 255).astype(np.uint8),
        (unmult[:, :, 1] * 255).astype(np.uint8),
        (unmult[:, :, 2] * 255).astype(np.uint8),
        (alpha * 255).astype(np.uint8)
    ])
    return bgra

def make_squircle_mask(h, w, cx, cy, rx, ry, n=4.2):
    """
    Generates an antialiased superellipse squircle mask.
    """
    y, x = np.ogrid[:h, :w]
    nx = np.abs((x - cx) / rx)
    ny = np.abs((y - cy) / ry)
    dist = np.power(nx, n) + np.power(ny, n)
    
    # Smooth antialiased boundary
    alpha = np.clip((1.012 - dist) / 0.025, 0.0, 1.0)
    alpha_u8 = (alpha * 255).astype(np.uint8)
    return cv2.GaussianBlur(alpha_u8, (3, 3), 0)

def main():
    print("Generating icon variants...")
    
    # ==========================================
    # VARIANT 1: 3D Fluid Neon (Vivid Mint-Cyan-Blue Glow)
    # ==========================================
    # 1.1 Isolated S + Cloud (no background)
    var1_isolated = clean_alpha_key('marketing/03_visuals/icon_v2_isolated_raw.jpg', black_thresh=0.015, power=0.8)
    cv2.imwrite('marketing/03_visuals/variant_1_isolated_s_cloud.png', var1_isolated)
    print("Saved variant_1_isolated_s_cloud.png")
    
    # 1.2 In Squircle (with transparent outer background)
    # Composite var1_isolated onto a dark luxury glass squircle
    sq_size = 1024
    sq_bg = np.zeros((sq_size, sq_size, 4), dtype=np.uint8)
    
    # Create dark obsidian glass squircle base
    cx, cy = 512, 512
    r = 430
    mask_outer = make_squircle_mask(sq_size, sq_size, cx, cy, r, r, n=4.4)
    
    # Gradient fill for squircle (dark obsidian #090d18 to #05070e)
    y, x = np.ogrid[:sq_size, :sq_size]
    diag = (x + y) / (2.0 * sq_size)
    b_val = (24 * (1 - diag) + 10 * diag).astype(np.uint8)
    g_val = (15 * (1 - diag) + 7 * diag).astype(np.uint8)
    r_val = (9 * (1 - diag) + 4 * diag).astype(np.uint8)
    
    sq_base = np.dstack([b_val, g_val, r_val, mask_outer])
    
    # Add subtle thin luminous border along the squircle edge
    # Erode mask by 3px
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    eroded = cv2.erode(mask_outer, kernel, iterations=1)
    border_mask = cv2.subtract(mask_outer, eroded)
    
    # Border gradient (mint #10b981 to cyan #22d3ee and blue #3b82f6)
    for c in range(3):
        sq_base[:, :, 0] = np.where(border_mask > 50, (238 * (1-diag) + 246 * diag).astype(np.uint8), sq_base[:, :, 0])
        sq_base[:, :, 1] = np.where(border_mask > 50, (211 * (1-diag) + 130 * diag).astype(np.uint8), sq_base[:, :, 1])
        sq_base[:, :, 2] = np.where(border_mask > 50, (34 * (1-diag) + 59 * diag).astype(np.uint8), sq_base[:, :, 2])

    # Overlay isolated S + cloud scaled to 78% inside squircle
    icon_scaled = cv2.resize(var1_isolated, (int(sq_size * 0.8), int(sq_size * 0.8)), interpolation=cv2.INTER_LANCZOS4)
    ih, iw = icon_scaled.shape[:2]
    off_y = (sq_size - ih) // 2
    off_x = (sq_size - iw) // 2
    
    var1_squircle = sq_base.copy()
    overlay_alpha = icon_scaled[:, :, 3].astype(np.float32) / 255.0
    for c in range(3):
        bg_col = var1_squircle[off_y:off_y+ih, off_x:off_x+iw, c].astype(np.float32)
        fg_col = icon_scaled[:, :, c].astype(np.float32)
        res_col = fg_col * overlay_alpha + bg_col * (1.0 - overlay_alpha)
        var1_squircle[off_y:off_y+ih, off_x:off_x+iw, c] = np.clip(res_col, 0, 255).astype(np.uint8)
        
    cv2.imwrite('marketing/03_visuals/variant_1_squircle_s_cloud.png', var1_squircle)
    print("Saved variant_1_squircle_s_cloud.png")

    # ==========================================
    # VARIANT 2: Direct 3D Original Glassmorphic
    # ==========================================
    orig_img = cv2.imread('marketing/03_visuals/icon_v2_fluid_cloud.jpg')
    
    # 2.1 Squircle from original 3D render with transparent background
    cx_orig, cy_orig = 512, 513
    rx_orig, ry_orig = 282, 285
    orig_mask = make_squircle_mask(1024, 1024, cx_orig, cy_orig, rx_orig, ry_orig, n=4.2)
    
    x1, y1 = max(0, cx_orig - rx_orig - 12), max(0, cy_orig - ry_orig - 12)
    x2, y2 = min(1024, cx_orig + rx_orig + 12), min(1024, cy_orig + ry_orig + 12)
    
    crop_orig = orig_img[y1:y2, x1:x2]
    crop_mask = orig_mask[y1:y2, x1:x2]
    
    var2_squircle = cv2.cvtColor(crop_orig, cv2.COLOR_BGR2BGRA)
    var2_squircle[:, :, 3] = crop_mask
    var2_squircle = cv2.resize(var2_squircle, (1024, 1024), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite('marketing/03_visuals/variant_2_squircle_s_cloud.png', var2_squircle)
    print("Saved variant_2_squircle_s_cloud.png")
    
    # 2.2 Isolated S + Cloud from original 3D render
    # Extract interior symbol with smooth alpha
    inner_crop = orig_img[260:770, 260:770].astype(np.float32) / 255.0
    max_inner = np.max(inner_crop, axis=2)
    alpha_inner = np.clip((max_inner - 0.22) / 0.38, 0.0, 1.0)
    alpha_inner = cv2.GaussianBlur(alpha_inner, (5, 5), 0)
    
    unmult_inner = np.zeros_like(inner_crop)
    safe_a = np.maximum(alpha_inner, 1e-4)
    for c in range(3):
        unmult_inner[:, :, c] = np.clip(inner_crop[:, :, c] / (safe_a ** 0.5), 0.0, 1.0)
        
    var2_isolated = np.dstack([
        (unmult_inner[:, :, 0] * 255).astype(np.uint8),
        (unmult_inner[:, :, 1] * 255).astype(np.uint8),
        (unmult_inner[:, :, 2] * 255).astype(np.uint8),
        (alpha_inner * 255).astype(np.uint8)
    ])
    var2_isolated = cv2.resize(var2_isolated, (1024, 1024), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite('marketing/03_visuals/variant_2_isolated_s_cloud.png', var2_isolated)
    print("Saved variant_2_isolated_s_cloud.png")

    # ==========================================
    # VARIANT 3: High-Contrast Crisp Minimalist
    # ==========================================
    # Clean, punchy silhouette with crisp alpha for small sizes
    v3_alpha = np.clip((var1_isolated[:, :, 3].astype(np.float32) / 255.0 - 0.08) / 0.85, 0.0, 1.0)
    v3_alpha = cv2.GaussianBlur(v3_alpha, (3, 3), 0)
    
    var3_isolated = var1_isolated.copy()
    var3_isolated[:, :, 3] = (v3_alpha * 255).astype(np.uint8)
    # Boost contrast and saturation slightly
    hsv = cv2.cvtColor(var3_isolated[:, :, :3], cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.15, 0, 255)
    hsv[:, :, 2] = np.clip(hsv[:, :, 2] * 1.10, 0, 255)
    var3_isolated[:, :, :3] = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    cv2.imwrite('marketing/03_visuals/variant_3_isolated_s_cloud.png', var3_isolated)
    print("Saved variant_3_isolated_s_cloud.png")
    
    # 3.2 Squircle for Variant 3 with macOS dock border profile
    var3_squircle = sq_base.copy()
    icon_scaled_v3 = cv2.resize(var3_isolated, (int(sq_size * 0.82), int(sq_size * 0.82)), interpolation=cv2.INTER_LANCZOS4)
    ih3, iw3 = icon_scaled_v3.shape[:2]
    off_y3 = (sq_size - ih3) // 2
    off_x3 = (sq_size - iw3) // 2
    ov_a3 = icon_scaled_v3[:, :, 3].astype(np.float32) / 255.0
    for c in range(3):
        bg_col = var3_squircle[off_y3:off_y3+ih3, off_x3:off_x3+iw3, c].astype(np.float32)
        fg_col = icon_scaled_v3[:, :, c].astype(np.float32)
        var3_squircle[off_y3:off_y3+ih3, off_x3:off_x3+iw3, c] = np.clip(fg_col * ov_a3 + bg_col * (1.0 - ov_a3), 0, 255).astype(np.uint8)
    cv2.imwrite('marketing/03_visuals/variant_3_squircle_s_cloud.png', var3_squircle)
    print("Saved variant_3_squircle_s_cloud.png")

    # Generate 512x512 downscaled copies for app bundles / web
    for name in [
        'variant_1_isolated_s_cloud', 'variant_1_squircle_s_cloud',
        'variant_2_isolated_s_cloud', 'variant_2_squircle_s_cloud',
        'variant_3_isolated_s_cloud', 'variant_3_squircle_s_cloud'
    ]:
        full = cv2.imread(f'marketing/03_visuals/{name}.png', cv2.IMREAD_UNCHANGED)
        down512 = cv2.resize(full, (512, 512), interpolation=cv2.INTER_LANCZOS4)
        cv2.imwrite(f'marketing/03_visuals/{name}_512.png', down512)

    print("All variants successfully created at 1024x1024 and 512x512!")

if __name__ == '__main__':
    main()

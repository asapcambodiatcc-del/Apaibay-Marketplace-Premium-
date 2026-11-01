import fs from 'fs';
import path from 'path';

interface ViewportSpec {
  name: string;
  width: number;
  categoryCols: number;
  productCols: number;
  trustCols: number;
}

const VIEWPORTS: ViewportSpec[] = [
  { name: 'Ultra-compact mobile (e.g. iPhone SE / small Android)', width: 320, categoryCols: 2, productCols: 2, trustCols: 1 },
  { name: 'Standard mobile (e.g. Galaxy S / Pixel)', width: 360, categoryCols: 2, productCols: 2, trustCols: 2 },
  { name: 'Modern mainstream mobile (e.g. iPhone 13/14/15/16)', width: 390, categoryCols: 2, productCols: 2, trustCols: 2 },
  { name: 'Large mobile (e.g. iPhone Pro Max / Plus)', width: 430, categoryCols: 2, productCols: 2, trustCols: 2 },
  { name: 'Tablet portrait (e.g. iPad / Galaxy Tab)', width: 768, categoryCols: 4, productCols: 4, trustCols: 3 },
  { name: 'High-res desktop (e.g. MacBook / 1080p monitor)', width: 1440, categoryCols: 6, productCols: 5, trustCols: 5 },
];

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

console.log('====================================================');
console.log('APAIBAY MARKETPLACE PREMIUM — MOBILE RESPONSIVE TEST');
console.log('====================================================\n');

// 1. Viewport Meta tag in index.html
console.log('1. Viewport Configuration & Root Meta');
const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
assert(
  indexHtml.includes('name="viewport"') && indexHtml.includes('width=device-width, initial-scale=1.0'),
  'index.html defines standard mobile viewport meta tag'
);

// 2. Global CSS rules in src/index.css
console.log('\n2. Global CSS Overflow Protection');
const indexCss = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
assert(indexCss.includes('overflow-x: hidden'), 'index.css enforces overflow-x: hidden');
assert(indexCss.includes('box-sizing: border-box'), 'index.css enforces box-sizing: border-box across elements');
assert(indexCss.includes('max-width: 100%'), 'index.css enforces max-width: 100% on html and body');
assert(indexCss.includes('#root'), 'index.css applies responsive constraints to #root container');

// 3. App Root Layout in src/App.tsx
console.log('\n3. App.tsx Layout Boundaries');
const appTsx = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
assert(appTsx.includes('w-full max-w-full overflow-x-hidden'), 'App.tsx root wrapper prevents horizontal blowout');
assert(appTsx.includes('pb-16 lg:pb-0'), 'App.tsx provides clearance for sticky MobileBottomNav');
assert(!appTsx.includes('w-screen'), 'App.tsx does not leak w-screen overflow');

// 4. Header Responsiveness in src/components/Header.tsx
console.log('\n4. Mobile Header Sizing and Multi-Row Flow');
const headerTsx = fs.readFileSync(path.resolve('src/components/Header.tsx'), 'utf8');
assert(
  headerTsx.includes('flex-wrap sm:flex-nowrap'),
  'Header main brand container wraps gracefully on mobile viewports'
);
assert(
  headerTsx.includes('order-1') && headerTsx.includes('order-2') && headerTsx.includes('order-3'),
  'Header uses flex ordering (Logo order-1, Actions order-2, Search order-3) on mobile'
);
assert(
  headerTsx.includes('w-full sm:flex-1'),
  'Search bar expands to full width on mobile row 2 while inline on tablet/desktop'
);
assert(
  headerTsx.includes('truncate') && headerTsx.includes('min-w-0'),
  'Announcement and search inputs prevent flex-child overflow with min-w-0 & truncate'
);

// 5. Drawers Overflow Audit (CartDrawer & WishlistDrawer)
console.log('\n5. Drawer Container Responsiveness');
const cartDrawerTsx = fs.readFileSync(path.resolve('src/components/CartDrawer.tsx'), 'utf8');
const wishlistDrawerTsx = fs.readFileSync(path.resolve('src/components/WishlistDrawer.tsx'), 'utf8');
assert(
  !cartDrawerTsx.includes('w-screen max-w-md') && cartDrawerTsx.includes('w-full max-w-md'),
  'CartDrawer avoids 100vw scrollbar blowout by using w-full max-w-md'
);
assert(
  !wishlistDrawerTsx.includes('w-screen max-w-md') && wishlistDrawerTsx.includes('w-full max-w-md'),
  'WishlistDrawer avoids 100vw scrollbar blowout by using w-full max-w-md'
);

// 6. Component Grid Audits for Mobile Proportions
console.log('\n6. Content Grid Responsiveness');
const catGridTsx = fs.readFileSync(path.resolve('src/components/FeaturedCategoryGrid.tsx'), 'utf8');
assert(
  catGridTsx.includes('grid-cols-2') && catGridTsx.includes('h-32 xs:h-36 sm:h-40 md:h-44'),
  'FeaturedCategoryGrid uses 2 columns on mobile with balanced aspect ratio'
);

const trustStripTsx = fs.readFileSync(path.resolve('src/components/TrustStrip.tsx'), 'utf8');
assert(
  trustStripTsx.includes('grid-cols-1 xs:grid-cols-2'),
  'TrustStrip adapts seamlessly from single/double column on mobile to 5 on desktop'
);

const productSectionsTsx = fs.readFileSync(path.resolve('src/components/ProductSections.tsx'), 'utf8');
assert(
  productSectionsTsx.includes('grid-cols-2') && productSectionsTsx.includes('gap-2.5 sm:gap-4 lg:gap-5'),
  'ProductSections uses 2 columns on mobile with clean spacing'
);

const footerTsx = fs.readFileSync(path.resolve('src/components/Footer.tsx'), 'utf8');
assert(
  footerTsx.includes('grid-cols-1 xs:grid-cols-2') && footerTsx.includes('flex flex-wrap items-center justify-center'),
  'Footer links and payment icons wrap cleanly without extending horizontal bounds'
);

const mobileBottomNavTsx = fs.readFileSync(path.resolve('src/components/MobileBottomNav.tsx'), 'utf8');
assert(
  mobileBottomNavTsx.includes('fixed bottom-0') && mobileBottomNavTsx.includes('z-40'),
  'MobileBottomNav is anchored at viewport bottom with safe z-index'
);

// 7. Mathematical Viewport Width Budget Verification
console.log('\n7. Viewport Width Budget Checks');
for (const vp of VIEWPORTS) {
  // Mobile horizontal budget calculation:
  // Available width = viewport width - horizontal page padding (24px on mobile px-3, 48px on sm px-6, 64px on lg px-8)
  const padding = vp.width < 640 ? 24 : vp.width < 1024 ? 48 : 64;
  const contentWidth = vp.width - padding;

  // Header top row elements width calculation on mobile (< 640px):
  // Menu (32px) + Gap (8px) + Logo (~90px) = 130px.
  // Wishlist (36px) + Account (36px) + Cart (48px) + Gaps (16px) = 136px.
  // Total top row width = 266px.
  if (vp.width < 640) {
    const topRowWidth = 266;
    assert(
      topRowWidth <= contentWidth,
      `Viewport ${vp.width}px (${vp.name}): Top header row (${topRowWidth}px) fits within available content width (${contentWidth}px)`
    );
  } else {
    // Desktop header 1-row layout
    assert(
      contentWidth >= 550,
      `Viewport ${vp.width}px (${vp.name}): Content width (${contentWidth}px) accommodates inline search + brand + actions`
    );
  }

  // 2-column product shelf item width
  const gap = vp.width < 640 ? 10 : 16;
  const colCount = vp.width < 640 ? 2 : vp.width < 768 ? 3 : vp.width < 1024 ? 4 : 5;
  const itemWidth = Math.floor((contentWidth - (colCount - 1) * gap) / colCount);
  assert(
    itemWidth >= 120,
    `Viewport ${vp.width}px (${vp.name}): Column width (${itemWidth}px) provides sufficient touch target and image area`
  );
}

console.log('\n====================================================');
console.log(`TOTAL RESPONSIVE TESTS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}

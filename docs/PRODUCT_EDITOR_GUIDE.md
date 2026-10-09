# Adding frames — guide for the shop

Status (10 Oct 2026): built and tested on the local emulators. **Not deployed.** Branch `San's(FE)`, commits `3d41666`, `3ef4c92`, `368ffeb`.

## 1. Set up your frame models once

**Admin → Catalogue → Frame Models → Add frame model.** Enter:

- the name customers see
- your moulding code
- material and colour
- moulding width
- cost per running foot
- an optional price change (for example, +₹200 for gold)

Then upload a straight, front-on photo of the frame. Empty margins are trimmed automatically. Drag the slider until the dashed line sits on the inner edge of the moulding. The preview shows a photo framed in it.

The **Making-cost rates** on the same page suggest each size's making cost:

- print, glass and back board, per square foot
- labour, hook and packing, per frame

Costs and margins are private. Customers never see them.

## 2. Add a frame

Go to **Admin → Products → + Add frame** and fill in the nine numbered sections:

1. **Kind of frame:**
   - **Ready-made** — your own picture: gods, film stars, art. Customers only choose the size and frame.
   - **Single photo** — the customer uploads one photo.
   - **Collage** — a layout made in Collage Templates.
2. **Name and details:** type the name and, for ready-made frames, what the picture shows. Then press **✦ Generate details**.
   - This fills in the description, highlights, how-it-works steps, care note, FAQ and every SEO field.
   - It's free and needs no AI service.
   - It scores 100 once the product has a photo.
   - Read it once before publishing.
3. **Design:**
   - Ready-made: upload the artwork at the highest resolution you have.
   - Single photo: nothing to do.
   - Collage: pick the design, or open the designer.
4. **Frame models:** tick the ones this product comes in. The ★ marks the frame the product page opens with.
5. **Sizes and prices:** tap the sizes you sell; each size gets one line per frame model.
   - Enter the MRP, selling price and making cost (↺ suggests a cost).
   - Margin and discount are worked out as you type.
   - **Fill other frames** copies prices to the other frame models, adding each model's price change.
   - Ready-made frames also show how sharp the artwork will print at each size.
6. **Product photos:** these appear on the shop and in Google. A ready-made frame uses its artwork if you add none.
7. **Description and FAQ:** edit freely. A blank line starts a new paragraph, `## ` starts a heading, `- ` starts a bullet.
8. **SEO:** the score and preview of what Google will show.
9. **Delivery and publishing:** dispatch days, HSN code, badges and status.

The right-hand panel shows what's still missing. **Publish** unlocks once the essentials are done.

One **Save** writes everything:

- the product
- every size × frame model, with its own SKU (e.g. `MURUGAN-12X18-TK101`)
- the private making costs
- the photos
- the print design (made automatically for ready-made and single-photo frames)

## What customers see

- Ready-made frames show the artwork framed straight away. There's no upload step, so they pick a size and frame and add to cart.
- Photo frames show the customer's photo inside the chosen frame model, both in the frame view and in the room views.
- The frame choice shows each moulding's real photo.

## Older products

Products made before this editor open in it marked "old setup". Each older size is matched to a frame model by name or colour; pick a model where none matches, then save. The old sizes keep their IDs, so carts and past orders keep working.

## Tested (local emulators)

- Frame models: create, trim the photo, set the width, preview, cost suggestion (₹479 for 12×18 in Teak at ₹40/ft).
- Ready-made product published at SEO 100, with 6 SKUs, private costs and one 2:3 design. On the shop:
  - choosing Royal Gold, 12×18 shows ₹1,499 (MRP ₹1,799)
  - added to cart and paid with the test payment as order BP-2026-00001
  - a print job was queued
  - invoice KG-INV-2026-000001 reads "12x18 in · Royal Gold"
- Single-photo product published at SEO 100. Customers must upload a photo, and it shows in the frame on the room walls.
- Collage linking, unchanged re-saves (no duplicate designs), switched-off sizes and old-product conversion are covered by emulator tests.
- Ready-made print rendering is covered by a print-service test; the print service wasn't run locally.

## Known limits

- Artwork is cut to each frame shape from the centre. A different-shaped size trims the edges, and the save warns you.
- The single-photo design fills the whole print. For a printed name or caption, design it as a collage.
- Renaming a frame model updates a product's size labels only when that product is next saved.
- Uploads are limited to 30 MB per picture.

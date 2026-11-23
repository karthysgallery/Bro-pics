/**
 * Real customer comments from KarthysGallery's Instagram, copied word for word (with the emojis), one per account.
 * Source: comment screenshots shared by the owner on 2026-11-23; "month" is worked out from Instagram's "68w" age
 * on that day, so it is approximate. No star ratings: Instagram comments don't carry one, so none are shown.
 * A comment is shown with a photo only when `photo` is set from a confirmed match; otherwise it stands on its own.
 * To take a comment down (a customer asks), delete its entry.
 */
export interface CustomerComment {
  handle: string;
  /** The person's name as it appears in their own Instagram username (null when the username isn't a name). */
  name: string | null;
  /**
   * A photo of THIS customer's own frame, only when the owner has confirmed it is theirs (e.g. they sent it with the
   * comment). Never filled from the general photo set.
   */
  photo?: string;
  /** YYYY-MM, approximate. */
  month: string;
  text: string;
}

export const INSTAGRAM_COMMENTS: CustomerComment[] = [
  {
    "handle": "_chandru_efx",
    "month": "2025-08",
    "text": "Worth for money, frame super quality ya irukku..🤍",
    "name": "Chandru"
  },
  {
    "handle": "akanya_02",
    "month": "2025-08",
    "text": "Frame quality semmaya iruku and too fast delivery packagewisesum semma very safe and securedah iruthuchi.....quality really semma... Worth for money",
    "name": "Akanya"
  },
  {
    "handle": "usha_balasubramanian_",
    "month": "2025-08",
    "text": "Frame spr ahh iruthuchu sis... Frame quality spr sis .Expect pannatha vida rmba spr ahh eruthuchu...",
    "name": "Usha B."
  },
  {
    "handle": "anu_magizhan",
    "month": "2025-08",
    "text": "Sis really very awesome entha price la eangayume evlo quality ku kedaikathu thank you🙏🙏❤❤❤❤",
    "name": "Anu M."
  },
  {
    "handle": "cozydeepi_8_05",
    "month": "2025-07",
    "text": "Quality is very good 👍 good packing and kindly",
    "name": "Deepi"
  },
  {
    "handle": "ramyiii_untold_story",
    "month": "2025-07",
    "text": "Super quality i am impressed 👏👏👏 tq",
    "name": "Ramya"
  },
  {
    "handle": "rahima__syed",
    "month": "2025-07",
    "text": "The frame quality is very nice and worth the money🔥❤️",
    "name": "Rahima S."
  },
  {
    "handle": "itzz_arthi.__",
    "month": "2025-07",
    "text": "I ordered many times mam❤️😍 really frame avlo super ah irukku mam❤️ also delivered faster and the packing was good😍 kandippa ellarum nambi order kudunga tharama panni tharuvaanga❤️😻 really it was worth for money❤️😇",
    "name": "Arthi"
  },
  {
    "handle": "rajni_rasigan_geethapriyan",
    "month": "2025-07",
    "text": "Really Frame romba nalla erukuthu best quality superb work thank you madam 👍🙏",
    "name": "Geethapriyan"
  },
  {
    "handle": "deepa_pradeepkumar",
    "month": "2025-04",
    "text": "The frame was so beautiful ....",
    "name": "Deepa P."
  },
  {
    "handle": "harini.03",
    "month": "2025-04",
    "text": "Quality of frame is very nice and received in good condition❤️🥰",
    "name": "Harini"
  },
  {
    "handle": "lavanyaarun1302",
    "month": "2025-04",
    "text": "Frame vangunen naanum romba azhaga iruku affordable um iruku thank you ❤️❤️😍😍",
    "name": "Lavanya A."
  },
  {
    "handle": "ival_jeevitha_arumugam",
    "month": "2025-04",
    "text": "Na expect pannatha vida frame super mam❤️ 555 worth mam🥰👏",
    "name": "Jeevitha A."
  },
  {
    "handle": "soundarya_ramesh_3_3",
    "month": "2025-04",
    "text": "555 ku worth than super ah iruku frame unexpected quality ❤️‍🩹",
    "name": "Soundarya R."
  },
  {
    "handle": "sri_abi_2005",
    "month": "2025-04",
    "text": "Frame super sis❤️... quality super ahh iruku ☺️",
    "name": "Abi"
  },
  {
    "handle": "amala_31291",
    "month": "2025-04",
    "text": "Wonderful frame work . Cheap price with best quality.. thanks sir",
    "name": "Amala"
  },
  {
    "handle": "sowndhu1307",
    "month": "2025-04",
    "text": "Frame supera irunthuchu sis naanu vaanguna intha amount ku worth sis 💝🥰",
    "name": "Sowndhu"
  },
  {
    "handle": "priyad_favi_darz",
    "month": "2025-04",
    "text": "Nice work 🔥🔥🔥🔥🔥",
    "name": "Priya"
  },
  {
    "handle": "t_h_i_l_a_k_e_s_h",
    "month": "2025-04",
    "text": "Frame Super 👌",
    "name": "Thilakesh"
  },
  {
    "handle": "yasikamaaran",
    "month": "2025-04",
    "text": "Frame super😍",
    "name": "Yasika M."
  },
  {
    "handle": "nithya.4641",
    "month": "2025-04",
    "text": "Frame nalla iruku, delivered on time",
    "name": "Nithya"
  },
  {
    "handle": "hey.itz.me.shiny.here",
    "month": "2025-04",
    "text": "Frame nala iruku sis ✨❤️",
    "name": "Shiny"
  },
  {
    "handle": "d_blossom___",
    "month": "2025-04",
    "text": "Frame super ah iruku mam ennota rendu frame fantastic ah iruthuchi thank you so much ❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️",
    "name": null
  },
  {
    "handle": "devil_king_0106",
    "month": "2025-04",
    "text": "Frame super 👍 nice work 👍👍❤️",
    "name": null
  },
  {
    "handle": "nguna5267",
    "month": "2025-04",
    "text": "Frame Supar mam ❤️❤️🫂🫂",
    "name": "Guna"
  },
  {
    "handle": "itz__ihtra__",
    "month": "2025-04",
    "text": "Frame super sis..... 💙 Quality and frame spr 😻",
    "name": "Ihtra"
  },
  {
    "handle": "_devils__pain_",
    "month": "2025-04",
    "text": "Quality is best of frame",
    "name": null
  },
  {
    "handle": "priya_dharshu_55",
    "month": "2025-04",
    "text": "Really the frame was amazing and good quality packing also super",
    "name": "Priya Dharshini"
  },
  {
    "handle": "gowthamindn",
    "month": "2025-04",
    "text": "It's really true' so cute and good quality",
    "name": "Gowtham"
  },
  {
    "handle": "s.saran_saran_s_m",
    "month": "2025-04",
    "text": "Frame super sister 🥰",
    "name": "Saran"
  },
  {
    "handle": "im__nila__fdo",
    "month": "2025-04",
    "text": "Frame quality very nice 🔥 excellent picture quality 😍😍 I like the frame so much 🥰 thank you sis🤝🤝",
    "name": "Nila"
  },
  {
    "handle": "kixho_.___",
    "month": "2025-04",
    "text": "Super Sister 📈",
    "name": null
  },
  {
    "handle": "_little_eye._",
    "month": "2025-04",
    "text": "Really Amazing work sister ❣️ Tq So Much sister😍 🔥",
    "name": null
  },
  {
    "handle": "_itzz_puni__",
    "month": "2025-04",
    "text": "Frame super sister 🥰Nice quality sis 😍",
    "name": "Puni"
  },
  {
    "handle": "curlzz_gurl_",
    "month": "2025-04",
    "text": "Frame is awesome...❤️🔥na sathiyama expect panave ila super ahh irunthuchu...ivlo kammi price la yaarunalu kuduka mudiyathu semmaya iruku...❤️❤️",
    "name": null
  },
  {
    "handle": "sparkleprincess601",
    "month": "2025-04",
    "text": "Frame seriously excellent ya iruku package was good. Really it was worth for the money💯 expect pannatha Vida super ra iruku tq sis 🥰",
    "name": null
  },
  {
    "handle": "praveen_arden",
    "month": "2025-04",
    "text": "Frame super sister 😊",
    "name": "Praveen"
  },
  {
    "handle": "anusuya_nivi",
    "month": "2025-04",
    "text": "Frame super akka 🥰🥰🥰",
    "name": "Anusuya"
  },
  {
    "handle": "karthikarthi4933",
    "month": "2025-04",
    "text": "Vera level frame good quality iam so happy😍😍😍",
    "name": "Karthi"
  },
  {
    "handle": "_rakzhxy._",
    "month": "2025-04",
    "text": "Loved this frame 😍 satisfied with their products 💕 do support nd follow this page",
    "name": null
  },
  {
    "handle": "vimu_alone__queen_11",
    "month": "2025-04",
    "text": "Frame vere level sis , serius ah ivalo kammiya engaium indha size le kedaikadhu sis masss😎❣️💞🪄🫶",
    "name": "Vimu"
  },
  {
    "handle": "_honey_queen_06",
    "month": "2025-04",
    "text": "Frame amazing 😍 sister thank you 🥰",
    "name": null
  },
  {
    "handle": "kpm_malli",
    "month": "2025-04",
    "text": "பிரேம் நான் வாங்கினேன் ரொம்ப ரொம்ப சூப்பரா இருந்தது நீங்களும் வாங்குங்க நல்லா பண்ணி தருவாங்க சூப்பரா இருந்தது பிரேம் 👌👌👌👌",
    "name": "Malli"
  },
  {
    "handle": "kd_princess_13",
    "month": "2025-04",
    "text": "Frame super sis 🥰",
    "name": null
  },
  {
    "handle": "mr_maruthu_18",
    "month": "2025-04",
    "text": "Really frame work is Good sister 😊",
    "name": "Maruthu"
  },
  {
    "handle": "kowsalyadhanasekaran",
    "month": "2025-04",
    "text": "I ordered 777 offer frame, the frame is really awesome. Also it delivered faster and the packaging was good. Glitter finishing was too good. Really it was worth for the money.",
    "name": "Kowsalya D."
  },
  {
    "handle": "boo_boo_miyaw_official",
    "month": "2025-04",
    "text": "Very very pretty finishing 😍, really romba nallaruku 🔥 thank you karthys gallery ❣️",
    "name": null
  },
  {
    "handle": "smiley_akash55",
    "month": "2025-04",
    "text": "Super ❤️",
    "name": "Akash"
  },
  {
    "handle": "kiruthika__112",
    "month": "2025-04",
    "text": "Nice frame work",
    "name": "Kiruthika"
  },
  {
    "handle": "_smilee_doll._",
    "month": "2025-04",
    "text": "Really amazing 🔥 My 1st order quality excellent nice work I'm so happy 😄 ❤️ thankyou",
    "name": null
  },
  {
    "handle": "v3_kabin",
    "month": "2025-04",
    "text": "Thanks mam I really amazing.❤️🥰",
    "name": "Kabin"
  },
  {
    "handle": "rajiselva29",
    "month": "2025-04",
    "text": "Frame Super Sister 😍 Thank you so much sister 🥰",
    "name": "Raji Selva"
  },
  {
    "handle": "thavamani_31",
    "month": "2025-04",
    "text": "Frame Super Sister Nice Work Thank you So Much❤️☺️",
    "name": "Thavamani"
  },
  {
    "handle": "thala_jeevanandham",
    "month": "2025-04",
    "text": "Really Amazing Work Sister❤️Thank you So much🤗🫂",
    "name": "Jeevanandham"
  },
  {
    "handle": "angalamman_sankar_05",
    "month": "2025-04",
    "text": "Nice work super quality sister ❤️❤️",
    "name": "Sankar"
  },
  {
    "handle": "thilip_king_vip_",
    "month": "2025-04",
    "text": "Good quality 😍 really amazing work sister 💯",
    "name": "Thilip"
  },
  {
    "handle": "spvpg",
    "month": "2025-04",
    "text": "Na order panna photo va na expect ah pannatha alavuku semmaya panni kuduthurukinga. Ithu ennoda first family photo frame. Nejamave enaku avlo happy ya iruku. Ini ella frames unga kitta tha pannuven. Thq soooo much mam❤️❤️❤️😍😍😍🔥🔥🔥",
    "name": null
  },
  {
    "handle": "abitamil3274",
    "month": "2025-04",
    "text": "Frame supper akka🥰💞✨",
    "name": "Abi"
  },
  {
    "handle": "vijayasha_ash",
    "month": "2025-04",
    "text": "Frame 1st time order panuna seriously supera eruku thu na expect panatha vida supera eruku thank you sis",
    "name": "Vijayasha"
  },
  {
    "handle": "mamas_pappu",
    "month": "2025-04",
    "text": "Frame semmaya iruku❤️ I didn't expect thiss🥰🥰 Thankyou so much",
    "name": null
  },
  {
    "handle": "natchaththira_priya",
    "month": "2025-04",
    "text": "Really worth",
    "name": "Natchaththira Priya"
  },
  {
    "handle": "yebin0015",
    "month": "2025-04",
    "text": "Nice Frame. Ordered Offer 666. No damage and the packaging was good. Delivered within 2 days. Glitter mate finish was too good. Really worth it.. 😍",
    "name": "Yebin"
  },
  {
    "handle": "sathyaganesh__",
    "month": "2025-04",
    "text": "Absolutely love this Mac-finished photo frame! The sleek design and premium finish make every picture stand out beautifully. A perfect blend of elegance and durability—highly recommended 🥹🤗✨",
    "name": "Sathya Ganesh"
  },
  {
    "handle": "dharsh2322",
    "month": "2025-04",
    "text": "Romba nala frame vathuruku really very amazing.. Thank you for your great working....",
    "name": "Dharsh"
  },
  {
    "handle": "sujithaarun.21",
    "month": "2025-04",
    "text": "Frame romba nalla iruku sister",
    "name": "Sujitha A."
  },
  {
    "handle": "ramyareventh",
    "month": "2025-03",
    "text": "Frame super 😍nice work",
    "name": "Ramya R."
  },
  {
    "handle": "muthusanthosh76",
    "month": "2025-03",
    "text": "Frame semaya sister nice work",
    "name": "Muthu Santhosh"
  },
  {
    "handle": "_dynamic_qween_x1",
    "month": "2025-03",
    "text": "Excellent work bro😍❤️🙌",
    "name": null
  },
  {
    "handle": "lip__stick_luvhh",
    "month": "2025-03",
    "text": "Super quality lam so happy 😍😍",
    "name": null
  },
  {
    "handle": "raj_n_s_200_bike_lover",
    "month": "2025-03",
    "text": "Frame rompave nalla irukku na ithuvaraikkum 4 frame vankirukka",
    "name": "Raj"
  },
  {
    "handle": "hate_able_bala",
    "month": "2025-03",
    "text": "Frames Recived panitan mam really superb work from you one more time ✨🔥💥",
    "name": "Bala"
  },
  {
    "handle": "veeruveeru73",
    "month": "2025-03",
    "text": "Unga work Nalla irukku frameum supera irukku qualityum nalla irukku so romba happy romba thanks sister 🙏👍",
    "name": "Veeru"
  },
  {
    "handle": "crazy_ponnu_8145",
    "month": "2025-03",
    "text": "Frame super ❤️❤️❤️ sister 😍",
    "name": null
  },
  {
    "handle": "broken__heart___05_",
    "month": "2025-03",
    "text": "Frame super sister😻🦋",
    "name": null
  }
];

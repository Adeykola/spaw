/**
 * data.js
 * ----------------------------------------------------------------------
 * Central content layer for the DrAjokesings platform prototype.
 *
 * Every collection here is shaped the way it would arrive from a real
 * REST/Supabase endpoint (id, timestamps, foreign-key style references)
 * so that swapping `DB.artists` etc. for a `fetch()` call later is a
 * mechanical change, not a rewrite. UI code should never assume this is
 * synchronous forever — see api.getX() helpers below, which already
 * return Promises with simulated latency and real failure surfaces.
 * ----------------------------------------------------------------------
 */

const DB = {
  siteSettings: {
    artistName: "Dr AjokeSings",
    tagline: "Worship, carried by voice.",
    locationLabel: "Lagos, Nigeria",
    email: "hello@dr-ajokesings.com",
    bookingEmail: "booking@dr-ajokesings.com",
    whatsappChannel: "https://whatsapp.com/channel/0029Vb65h9vDTkJvUfOFSx1e",
    social: {
      instagram: "https://instagram.com/drajokesings",
      youtube: "https://youtube.com/@drajokesings",
      tiktok: "https://tiktok.com/@drajokesings",
      twitter: "https://twitter.com/drajokesings",
      spotify: "https://open.spotify.com/artist/2100bZJXO99ZBmNZRzvT4L",
    },
  },

  artists: [
    {
      id: "artist-001",
      name: "Dr AjokeSings",
      role: "Worship Minister & Recording Artist",
      bio: "Dr AjokeSings writes and sings from the meeting point of scripture, memory, and modern African sound — songs built for the room to disappear and the presence to remain.",
      quote: "I don't perform worship. I open a door and stand out of the way.",
      stats: [
        { label: "Years in ministry", value: "14" },
        { label: "Original songs", value: "62" },
        { label: "Nations reached", value: "23" },
      ],
      heroImage: "assets/images/hero-portrait.jpg",
      portrait: "assets/images/artist-portrait.jpg",
    },
  ],

  /* No albums yet: every release so far is a single, so the album
   * sections (the homepage's Latest Album, the Music page's albums strip
   * and filter pills) hide themselves until one is added here. */
  albums: [],

  /* Her songs, in the order she lists them: the homepage catalogue shows
   * them in this order, the Music page sorts them by date. Where a song is
   * on her YouTube channel, releaseDate is that video's publish date,
   * links.youtube points to it, and the artwork is its title card
   * (assets/images/songs/). Songs not on YouTube use a photo of her as
   * stand-in artwork. Lengths, lyrics, stories and the other streaming
   * links stay empty until they are known rather than being made up.
   * audioSrc is still the prototype's sample audio. */
  tracks: [
    {
      id: "track-001", title: "Alagbara", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: true,
      releaseDate: "2026-08-28", duration: null, lyrics: [], description: "Her newest release, featuring Pelumi Deborah.",
      artwork: "assets/images/Alagbara.jpeg", audioSrc: "assets/audio/sample-01.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=rWDUeppY2Gk", spotify: "https://open.spotify.com/track/2I32OFptWA6b91uN9b2DVg", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-002", title: "Awesome Forever", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2026-07-17", duration: null, lyrics: [], description: "",
      artwork: "assets/images/Awesome-forever.jpeg", audioSrc: "assets/audio/sample-02.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=QTTEkv4eSJU", spotify: "https://open.spotify.com/track/3eVXqbGyibPP7wJYAbvjIu", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-004", title: "Iba Re", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2026-07-31", duration: null, lyrics: [], description: "",
      artwork: "assets/images/songs/iba-re.jpg", audioSrc: "assets/audio/sample-03.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=XgggH0xKA3I", spotify: "https://open.spotify.com/track/6rtjBd1OZbavS0eo17lfA5", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-003", title: "You Are God", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2026-08-14", duration: null, lyrics: [], description: "",
      artwork: "assets/images/you-are-god.jpeg", audioSrc: "assets/audio/sample-04.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=yi8cQe-5QwQ", spotify: "https://open.spotify.com/track/5PjNboubZGiRkK1zIYuDMd", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-005", title: "Glory", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: null, duration: null, lyrics: [], description: "",
      artwork: "assets/images/TGE-1.jpeg", audioSrc: "assets/audio/sample-05.mp3",
      links: { youtube: null, spotify: null, appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-006", title: "My Help", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: null, duration: null, lyrics: [], description: "",
      artwork: "assets/images/ministry-hero.jpg", audioSrc: "assets/audio/sample-06.mp3",
      links: { youtube: null, spotify: null, appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-007", title: "My All", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: null, duration: null, lyrics: [], description: "",
      artwork: "assets/images/motion-1.jpeg", audioSrc: "assets/audio/sample-01.mp3",
      links: { youtube: null, spotify: null, appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-008", title: "Oba Nla", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2025-07-18", duration: null, lyrics: [], description: "",
      artwork: "assets/images/songs/oba-nla.jpg", audioSrc: "assets/audio/sample-02.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=GHeRQA2G9LI", spotify: "https://open.spotify.com/track/54RBwOOP8BjnOWt7cZDgcD", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-009", title: "Lifted", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2025-08-08", duration: null, lyrics: [], description: "",
      artwork: "assets/images/songs/lifted.jpg", audioSrc: "assets/audio/sample-03.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=VgGv1ZV3umY", spotify: "https://open.spotify.com/track/0iIZexW7OZveiJs7AtDFco", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-010", title: "Eledumare", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2025-08-01", duration: null, lyrics: [], description: "",
      artwork: "assets/images/songs/eledumare.jpg", audioSrc: "assets/audio/sample-04.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=Q2iz7ntwk50", spotify: "https://open.spotify.com/track/3yjLeTxEjwqjJWWzDJ3RsI", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-011", title: "Osuba Re", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2025-07-18", duration: null, lyrics: [], description: "",
      artwork: "assets/images/songs/osuba-re.jpg", audioSrc: "assets/audio/sample-05.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=TfsTEKgkOpc", spotify: "https://open.spotify.com/track/0swMZSXOn3pfN6pNo5kXHL", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-012", title: "Jesus Wept", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2026-04-05", duration: null, lyrics: [], description: "",
      artwork: "assets/images/songs/jesus-wept.jpg", audioSrc: "assets/audio/sample-06.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=vT8jEObVvJA", spotify: "https://open.spotify.com/track/6uHxvY4buZHzqWacZjROZh", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-013", title: "Osuba Re Praise Medley", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: null, duration: null, lyrics: [], description: "",
      artwork: "assets/images/motion.jpeg", audioSrc: "assets/audio/sample-01.mp3",
      links: { youtube: null, spotify: "https://open.spotify.com/track/5W7Kls0ADcMF4AGnOYgkZk", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-014", title: "Great and Mighty", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2025-08-15", duration: null, lyrics: [], description: "",
      artwork: "assets/images/songs/great-and-mighty.jpg", audioSrc: "assets/audio/sample-02.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=HJ2G6GieNrQ", spotify: "https://open.spotify.com/track/7hIe3D6pRlCzsh468WWCBS", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-015", title: "Joy to the World", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2024-12-21", duration: null, lyrics: [], description: "The title song of her Christmas release.",
      artwork: "assets/images/songs/joy-to-the-world.jpg", audioSrc: "assets/audio/sample-03.mp3",
      links: { youtube: null, spotify: "https://open.spotify.com/track/5XyRPAvE8x2Jrbl5BiNb1h", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-016", title: "All Creation", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2025-07-18", duration: null, lyrics: [], description: "From Osuba Re (Live), recorded with the full band.",
      artwork: "assets/images/songs/all-creation.jpg", audioSrc: "assets/audio/sample-04.mp3",
      links: { youtube: null, spotify: "https://open.spotify.com/track/1qmrTpNBfX5WhMhTFSIbmS", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-017", title: "Worship Experience", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2026-07-17", duration: null, lyrics: [], description: "",
      artwork: "assets/images/songs/worship-experience.jpg", audioSrc: "assets/audio/sample-05.mp3",
      links: { youtube: "https://www.youtube.com/watch?v=2pF3om8bbYM", spotify: "https://open.spotify.com/track/23NwrOuSUjbDbq9H16FLCC", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-018", title: "Hark the Herald", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2024-12-21", duration: null, lyrics: [], description: "From her Christmas release, Joy to the World.",
      artwork: "assets/images/songs/joy-to-the-world.jpg", audioSrc: "assets/audio/sample-06.mp3",
      links: { youtube: null, spotify: "https://open.spotify.com/track/3hwCkgzoOj56FMjsrQpGWT", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-019", title: "Holy Night", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2024-12-21", duration: null, lyrics: [], description: "From her Christmas release, Joy to the World.",
      artwork: "assets/images/songs/joy-to-the-world.jpg", audioSrc: "assets/audio/sample-01.mp3",
      links: { youtube: null, spotify: "https://open.spotify.com/track/79xRc7EPRuSY73QRJSki0r", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-020", title: "Mary Did You Know", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2024-12-21", duration: null, lyrics: [], description: "From her Christmas release, Joy to the World.",
      artwork: "assets/images/songs/joy-to-the-world.jpg", audioSrc: "assets/audio/sample-02.mp3",
      links: { youtube: null, spotify: "https://open.spotify.com/track/7rtuKYWikNgS7xmYeQqGt6", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
    {
      id: "track-021", title: "Silent Night", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false,
      releaseDate: "2024-12-21", duration: null, lyrics: [], description: "From her Christmas release, Joy to the World.",
      artwork: "assets/images/songs/joy-to-the-world.jpg", audioSrc: "assets/audio/sample-03.mp3",
      links: { youtube: null, spotify: "https://open.spotify.com/track/3Ht6I9pGhRdkdwYcwKCAUV", appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
    },
  ],

  /* Videos come from her YouTube channel, not from this file. `videos` is
   * a snapshot of the channel's long-form uploads (Shorts left out), taken
   * from its public feeds when the site was last built. At runtime
   * api._youtube() reads the live feed and merges it over the snapshot,
   * so a new upload appears first on its own; the snapshot is what shows
   * if the feed can't be reached, and it keeps older videos listed after
   * they drop out of the feed's newest-ten window. `category` is set only
   * where the title alone can't place a video (see api._videoCategory). */
  youtube: {
    channelId: "UCTlHt_0n__lwSySZE6lDiuw",
    channelUrl: "https://www.youtube.com/@drajokesings",
    cacheMinutes: 30,
  },

  videos: [
    { youtubeId: "rWDUeppY2Gk", published: "2026-08-28", title: "Alagbara - DrAjokesings ft. Pelumi Deborah" },
    { youtubeId: "yi8cQe-5QwQ", published: "2026-08-14", title: "You are God - DrAjokesings" },
    { youtubeId: "XgggH0xKA3I", published: "2026-07-31", title: "Iba re - DrAjokesings" },
    { youtubeId: "QTTEkv4eSJU", published: "2026-07-17", title: "Awesome Forever - DrAjokesings" },
    { youtubeId: "2pF3om8bbYM", published: "2026-07-03", title: "Worship Experience (Live) - DrAjokesings" },
    { youtubeId: "vT8jEObVvJA", published: "2026-04-05", title: "DrAjokesings - Jesus Wept" },
    { youtubeId: "4cSQgXJtUdY", published: "2025-12-13", title: "EMMA OH MY GOD LIVE AT THE 1ST EDITION OF SPAW CONCERT" },
    { youtubeId: "hv2gaH38hfE", published: "2025-12-13", title: "BEEJAY SAX  LIVE AT THE 1ST EDITION OF SPAW CONCERT" },
    { youtubeId: "Sq4iQVVjstY", published: "2025-12-13", title: "LILIAN NNEJI PERFORMANCE AT THE 1ST EDITION OF SPAW CONCERT" },
    { youtubeId: "wbaSkEZG-Q4", published: "2025-12-13", title: "PELUMI DEBORAH PERFORMANCE AT THE 1ST EDITION OF SPAW CONCERT" },
    { youtubeId: "IHi2aY8CTpk", published: "2025-12-07", title: "SYMPHONY OF PRAISE & WORSHIP CONCERT — 1ST EDITION  with Dr. Ajoke Sings (Ajoke Ogunsan)" },
    { youtubeId: "INrOiAaEZZI", published: "2025-11-28", title: "ISIOMA CHARLES Interview and Audition" },
    { youtubeId: "T8nDp59rgpc", published: "2025-11-28", title: "TAIWO AREGBESOLA Interview and Auditions" },
    { youtubeId: "09ehsHbWoTI", published: "2025-11-28", title: "AMAH BROWN Interviews and Audition" },
    { youtubeId: "xZrXH2mFKRk", published: "2025-11-28", title: "PEACE EDEGWA AUDITIONS" },
    { youtubeId: "o6kNM4dDyzM", published: "2025-11-28", title: "31 ADESHIMISOLA SAMUEL", category: "Talent Quest" },
    { youtubeId: "p3Fgd4ZXDrw", published: "2025-11-01", title: "SPAW TALENT QUEST" },
    { youtubeId: "i6yj7g2HIxQ", published: "2025-10-23", title: "Ajoke Ogunsan  Live Stream" },
  ],

  /* Photo galleries for media.html — one per event, lead frame first, then
   * the night in the order it happened. Captions describe what is in the
   * frame rather than naming guests; the photographer is credited on every
   * set and on every photograph in the lightbox. */
  galleries: [
    {
      id: "gal-001",
      event: "Symphony of Praise & Worship",
      title: "The concert, in stills",
      credit: "Klala Photography",
      photos: [
        {
          id: "ph-001",
          src: "assets/images/gallery/spaw-stage-gold.jpeg",
          caption: "Dr AjokeSings on stage",
          alt: "Dr AjokeSings sings on stage in a gold sequinned gown, one hand outstretched, with Symphony of Praise and Worship screens glowing behind her.",
        },
        {
          id: "ph-002",
          src: "assets/images/gallery/spaw-registration.jpeg",
          caption: "Doors open, and the queue at the registration desk",
          alt: "A crowd queues at the Symphony of Praise and Worship registration desk in a hotel foyer while volunteers in white event T-shirts check guests in.",
        },
        {
          id: "ph-003",
          src: "assets/images/gallery/spaw-front-row.jpeg",
          caption: "The front row, hands already raised",
          alt: "Two guests dressed in white, wearing white caps, sit in the front row with both hands raised in worship while the audience and camera crews fill the room behind them.",
        },
        {
          id: "ph-004",
          src: "assets/images/gallery/spaw-stage-drum.jpeg",
          caption: "A duet with the drum",
          alt: "Dr AjokeSings laughs mid-song beside a performer in purple sequins and orange feathers carrying a set of small drums, the stage washed in red and green light.",
        },
        {
          id: "ph-005",
          src: "assets/images/gallery/spaw-front-row-song.jpeg",
          caption: "Off the stage, singing to the front row",
          alt: "Dr AjokeSings leans down with her microphone to sing to a seated guest in a white agbada and blue cap, with guests and ushers standing around them.",
        },
        {
          id: "ph-006",
          src: "assets/images/gallery/spaw-shared-song-01.jpeg",
          caption: "A song, shared",
          alt: "Dr AjokeSings, in a gold sequinned gown, sings with her head close to a smiling guest in a blue and white floral dress and a white head wrap.",
        },
        {
          id: "ph-007",
          src: "assets/images/gallery/spaw-shared-song-02.jpeg",
          caption: "And the laugh that followed",
          alt: "Dr AjokeSings and a guest in a blue floral dress laugh together with the microphone between them as a camera light shines from the side.",
        },
        {
          id: "ph-008",
          src: "assets/images/gallery/spaw-singing-back.jpeg",
          caption: "Singing it back",
          alt: "A guest in a blue floral dress and white head wrap sings along with her hands clasped, photographers and guests around her.",
        },
        {
          id: "ph-009",
          src: "assets/images/gallery/spaw-guests-of-honour.jpeg",
          caption: "Guests of honour, on their feet",
          alt: "A guest in a white agbada and blue patterned cap smiles beside an applauding guest in a blue floral dress, the audience standing and clapping around them.",
        },
      ],
    },
  ],

  emergingArtists: [
    { id: "ea-001", name: "Tioluwani Grace", role: "Vocalist, Class of 2025", photo: "assets/images/motion-5.jpeg", bio: "A Lagos-raised vocalist whose falsetto stopped last year's finals cold." },
    { id: "ea-002", name: "Emeka Bright", role: "Songwriter, Class of 2025", photo: "assets/images/Violinist.jpeg", bio: "Writes in Igbo and English, often in the same verse." },
    { id: "ea-003", name: "Nnenna Faith", role: "Vocalist, Class of 2024", photo: "assets/images/spaw-duet.webp", bio: "Now touring as a backing vocalist across West Africa." },
    { id: "ea-004", name: "David Uche", role: "Producer, Class of 2024", photo: "assets/images/spaw-stage-02.webp", bio: "Produced three of the tracks on this year's finalist EP." },
  ],

  ministry: {
    missionStatement: "This is not a stage. It's an altar built for the ones still searching — a ministry that makes room for doubt, grief, and joy in the same breath.",
    pillars: [
      { title: "Worship", body: "Original music and live sessions built for congregations, not just crowds." },
      { title: "Mentorship", body: "One-on-one and cohort mentorship for emerging worship leaders and songwriters." },
      { title: "Resources", body: "Chord charts, devotionals, and session recordings, released freely to local churches." },
      { title: "Community", body: "A standing table for artists, pastors, and first-time visitors alike." },
    ],
    mentorship: {
      title: "The Mentorship Track",
      description: "A six-month cohort pairing emerging worship leaders with working musicians, producers, and pastors — one Saturday a month, plus monthly one-on-ones.",
      intake: "Opens every January and July.",
    },
    workshops: [
      { id: "ws-001", title: "Songwriting for Worship", facilitator: "Dr AjokeSings", format: "In-person, Lagos", cadence: "Quarterly" },
      { id: "ws-002", title: "Vocal Health for Worship Leaders", facilitator: "Guest: Dr. Funmi Ade", format: "Virtual", cadence: "Bi-monthly" },
      { id: "ws-003", title: "Building a Sustainable Worship Team", facilitator: "Ministry Team", format: "In-person, Abuja", cadence: "Twice yearly" },
    ],
    resources: [
      { id: "res-001", title: "Covenant — Chord Charts (Full Album)", type: "PDF", size: "2.4 MB" },
      { id: "res-002", title: "A Lament Devotional — 7 Days", type: "PDF", size: "1.1 MB" },
      { id: "res-003", title: "Threshold — Live Session Multitracks", type: "ZIP", size: "340 MB" },
    ],
  },

  /* Symphony of Praise & Worship is two things in one season and nothing
   * else: the concert itself, and the Talent Quest that fills its stage.
   * Mentorship lives under `ministry` above — it is a separate programme
   * and must not be described as part of Symphony. */
  symphony: {
    title: "Symphony of Praise & Worship",
    tagline: "One night of worship, and the search that fills its stage.",
    description: "Symphony of Praise & Worship is a concert and a talent quest running on the same calendar. The night itself is a full-length worship gathering built around the house band and the room. The Quest calls the newest voices to come on board and take that stage: singers, songwriters, instrumentalists and producers are invited to apply.",
    // SPAW 2026, as printed on the official flyer: the Talent Quest on
    // Friday 27 November and the concert the next day, both at Regal Hall.
    // The flyer gives no times, so doors/start stay null (shown as "to be
    // announced") until the organisers confirm them.
    applicationOpens: "2026-08-01",
    applicationCloses: "2026-11-01",
    questDate: "2026-11-27",
    tracks: ["Vocalist", "Songwriter", "Instrumentalist", "Producer"],
    ageCategories: ["Under 18", "18–24", "25–34", "35–44", "45–54", "55 and over"],

    concert: {
      eventId: "event-004",
      name: "SPAW Global Concert with Dr AjokeSings",
      date: "2026-11-28",
      doors: null,
      start: null,
      venue: "Regal Hall, Daystar Christian Center",
      city: "Oregun, Ikeja, Lagos",
      capacity: 800,
      admission: "Free entry — registration required",
      // A stand-in until the client sends their own write-up. The "See more"
      // sheet on the homepage's concert slide (index.html) carries the same
      // paragraph, so change the two together.
      description: "Dr AjokeSings, Nigerian gospel music minister, hosts the SPAW Global Concert. On Saturday 28 November 2026 she leads a night of praise and worship at Regal Hall, Daystar Christian Center, Oregun, Ikeja, Lagos, joined by the new voices found at the SPAW Talent Quest the day before. Entry is free; registration is required.",
      highlights: [
        { title: "The house band", body: "Fourteen pieces — strings, horns, talking drum, and the rhythm section that cut Covenant live in Lagos." },
        { title: "One continuous set", body: "No interval and no support slot in the usual sense. The room stays in it from the first note to the last." },
        { title: "The finalists open", body: "The Talent Quest class of 2026 takes the first half hour, backed by the same band, on the same stage." },
        { title: "Free, but registered", body: "Entry costs nothing. Registration is capped at eight hundred, and it closes when the room is full." },
      ],
    },

    quest: {
      title: "The Talent Quest",
      tagline: "Applications are open. Come on board: a yearly search for the next generation of worship voices.",
      description: "Calling singers, songwriters, instrumentalists and producers: come on board and apply. Four tracks, one cohort, and one clear prize: your own recording, finished properly, and a place on the Symphony stage in front of a full house. The Quest is held live at Regal Hall, Daystar Christian Center, the day before the concert, and every applicant hears back, whichever way the answer goes.",
      // What the winners take home. Shown on the homepage's Talent Quest
      // slide and on the Symphony page; edited in admin → Symphony.
      prizes: [
        { place: "Winner", amount: "₦750,000", extra: "plus song recording, mixing and mastering" },
        { place: "Runner-up", amount: "₦500,000", extra: "plus a studio session" },
        { place: "Second runner-up", amount: "₦350,000", extra: "plus a studio session" },
      ],
      benefits: [
        { title: "Funded studio time", body: "Studio days toward one original recording, cut with the Symphony house team in Lagos." },
        { title: "The Symphony stage", body: "A performance slot at the SPAW Global Concert, backed by the full fourteen-piece band." },
        { title: "Released properly", body: "Your finished recording mixed, mastered, and released across the streaming platforms under your own name." },
        { title: "Photography & artwork", body: "A photo and video session plus cover artwork, so the song arrives looking like itself." },
      ],
    },

    terms: "By applying, you confirm the material submitted is your own original work or that you hold the rights to perform it, and you agree to be contacted by the Symphony team regarding your application.",
  },

  events: [
    {
      id: "event-001",
      name: "Covenant — Album Listening Night",
      venue: "Terra Kulture, Victoria Island",
      city: "Lagos, Nigeria",
      date: "2026-10-18",
      time: "18:00",
      capacity: 300,
      registered: 214,
      description: "An intimate first listen to Covenant with the full live ensemble, followed by a Q&A.",
      image: "assets/images/TGE-1.jpeg",
      ticketRequired: true,
    },
    {
      id: "event-002",
      name: "Symphony of Praise & Worship — Talent Quest",
      venue: "Regal Hall, Daystar Christian Center",
      city: "Oregun, Ikeja, Lagos",
      date: "2026-11-27",
      time: null, // not yet announced
      capacity: 150,
      registered: 96,
      description: "Calling vocalists, songwriters, instrumentalists and producers: apply to take the stage at the SPAW Talent Quest, held live the day before the concert. Everyone else can register to come and watch.",
      image: "assets/images/spaw-stage-01.webp",
      ticketRequired: true,
      // The registration form's own questions (admin → Events → Registration form).
      phone: "optional",
      formFields: [
        { id: "location", label: "Where do you live?", type: "location", required: true, options: [], help: "" },
        { id: "gender", label: "Gender", type: "select", required: true, options: ["Female", "Male", "Prefer not to say"], help: "" },
        { id: "age", label: "Age category", type: "select", required: true, options: ["Under 18", "18–24", "25–34", "35–44", "45–54", "55 and over"], help: "" },
      ],
    },
    {
      id: "event-003",
      name: "Threshold Anniversary Worship Night",
      venue: "The Balmoral Centre",
      city: "Abuja, Nigeria",
      date: "2026-12-05",
      time: "17:30",
      capacity: 500,
      registered: 340,
      description: "Three years of Threshold, celebrated with a full-band worship night.",
      image: "assets/images/motion-3.jpeg",
      ticketRequired: true,
    },
    {
      id: "event-004",
      name: "SPAW Global Concert with Dr AjokeSings",
      venue: "Regal Hall, Daystar Christian Center",
      city: "Oregun, Ikeja, Lagos",
      date: "2026-11-28",
      time: null, // not yet announced
      capacity: 800,
      registered: 122,
      description: "One night of worship with the full house band, opened by this year's Talent Quest finalists.",
      image: "assets/images/spaw-duet.webp",
      ticketRequired: true,
      phone: "optional",
      formFields: [
        { id: "location", label: "Where do you live?", type: "location", required: true, options: [], help: "" },
        { id: "gender", label: "Gender", type: "select", required: true, options: ["Female", "Male", "Prefer not to say"], help: "" },
      ],
    },
  ],

  /* The About page's lists (about.js draws them once anything has been
   * published for them; until then the page's own HTML shows the same
   * items). Titles, bodies and captions may carry <em>. */
  about: {
    timeline: [
      { year: "2012", title: "A corridor, then a choir stand", body: "Joins the worship team at a 200-seat assembly in Surulere as a backing vocalist. Writes the first eleven songs nobody will ever hear.", current: false, links: [] },
      { year: "2015", title: "First ministration outside Nigeria", body: "An invitation to Accra turns into six countries in eighteen months. Learns that a song survives translation only if the silence around it does too.", current: false, links: [] },
      { year: "2019", title: "The doctorate, and a decision", body: "Completes doctoral work in music and liturgy. Turns down a touring contract the same month, choosing local church work over a release schedule.", current: false, links: [] },
      { year: "2022", title: "<em>Threshold</em>", body: "The debut record — worship reimagined through highlife rhythm and orchestral strings. <em>Threshold</em> itself is cut in a single take at midnight and never re-recorded.", current: false, links: [] },
      { year: "2023", title: "Symphony of Praise & Worship begins", body: "The concert and its Talent Quest launch together — nine applicants, one rented rehearsal room, and a hall that was two-thirds full. Four of that first cohort are still working in music today.", current: false, links: [] },
      { year: "2025", title: "<em>Covenant</em>", body: "Nine songs about promises kept in the dark, recorded live with a fourteen-piece ensemble in Lagos. The multitracks are later released free to local churches.", current: false, links: [] },
      {
        year: "2026", title: "The fourth Talent Quest — and the Global Concert",
        body: "Applications are open for Talent Quest Vol. IV — singers, songwriters, instrumentalists and producers, come on board — and the season comes home to Regal Hall, Daystar Christian Center: the Talent Quest on 27 November, and the SPAW Global Concert on the 28th.",
        current: true, links: [{ label: "Apply to the Talent Quest", href: "symphony#apply" }, { label: "See the calendar", href: "events" }],
      },
    ],
    principles: [
      { title: "Scripture before sentiment", body: "Every lyric is checked against the text before it is checked against the melody. A line that moves a room but misrepresents God does not make the record." },
      { title: "The room is not the metric", body: "Three hundred people and thirty people get the same preparation. Attendance has never been allowed to set the standard of the ministration." },
      { title: "Give the material away", body: "Chord charts, devotionals, and full live-session multitracks go out free to local churches. If a song can serve a congregation without her in the room, it should." },
      { title: "Always be handing it over", body: "Mentorship is not a side programme, it is succession planning. The point is a generation that no longer needs the person who trained them." },
    ],
    photos: [
      { src: "assets/images/TGE-1.jpeg", alt: "Leading worship on a white stage with the full band and choir behind her", caption: "The Glory Experience — full band, full house" },
      { src: "assets/images/Violinist.jpeg", alt: "The string section playing, flute, violins and cello in white", caption: "The string section, mid-set" },
      { src: "assets/images/picturesf.jpeg", alt: "Dr AjokeSings and her husband at the Iba Re launch", caption: "At the <em>Iba Re</em> launch, together as always" },
      { src: "assets/images/motion-5.jpeg", alt: "A worshipper in the congregation with her hand raised", caption: "The room, somewhere in the middle of it" },
    ],
    recognition: [
      { year: "2026", title: "Keynote ministration — West African Worship Leaders Convening, Accra", tag: "Ministration" },
      { year: "2025", title: "<em>Covenant</em> named Gospel Record of the Year, Lagos Music Circle", tag: "Award" },
      { year: "2025", title: "Long-form interview — “On Grief and Songwriting”", tag: "Feature" },
      { year: "2024", title: "Guest lecturer in liturgy and songwriting, University of Lagos", tag: "Teaching" },
      { year: "2023", title: "Founder — Symphony of Praise & Worship talent platform", tag: "Ministry" },
      { year: "2022", title: "<em>Threshold</em> debuts at number one on the national gospel chart", tag: "Release" },
    ],
  },

  /* The contact page: its questions and answers (answers may carry <em>
   * and links), and the choices the booking form offers. */
  contact: {
    faq: [
      { question: "How far in advance should we book?", answer: "Three months is comfortable, six is ideal for anything with travel attached. Requests inside six weeks are still welcome — they are simply harder to place, and the team will tell you honestly and quickly if the date cannot hold." },
      { question: "We are a small church with almost no budget. Should we still ask?", answer: "Yes. A portion of every year is deliberately kept for local congregations who cannot pay a standard honorarium. Say so plainly in your message — it will not count against you." },
      { question: "Does she travel with a band?", answer: "She can come solo, with a rhythm section, or with the full fourteen-piece ensemble. Tick what you are hoping for in the booking form and the team will send technical and hospitality riders for each option." },
      { question: "Can we record or livestream the ministration?", answer: "Almost always yes, with a short written agreement covering how the footage is used. Mention it up front so it is settled before the day rather than during soundcheck." },
      { question: "Where do I get photos, bio, and stage requirements?", answer: "Ask for the press kit through this form and it comes back as one link: approved biography at three lengths, high-resolution images, logo files, technical rider, and hospitality rider." },
      { question: "I want mentorship. Is this the right form?", answer: 'Yes. Mentorship runs under the <a href="ministry">ministry</a>, with intake every January and July — send a message here and say which intake you are aiming for. It is a separate thing from the <a href="symphony">Symphony Talent Quest</a>, which has <a href="symphony#apply">its own application</a> because it collects your music — singers, songwriters, instrumentalists and producers are all welcome to apply.' },
    ],
    eventTypes: ["Sunday service", "Worship night", "Conference", "Concert", "Crusade / outreach", "Workshop / masterclass", "Wedding", "Corporate or private event", "Other"],
    budgets: ["Local church — whatever is possible", "Under ₦500,000", "₦500,000 – ₦1,500,000", "Above ₦1,500,000", "International — travel & accommodation covered"],
    needs: ["Full worship ministration", "Short set — two or three songs", "Workshop or masterclass", "Panel or speaking slot", "Full band required"],
  },

  /* The bar across the top of every page. Each: { id, text, linkLabel,
   * link, start, end, active }; the first active one inside its dates
   * shows. None to begin with. */
  announcements: [],
};

/* ----------------------------------------------------------------------
 * Local persistence layer (prototype only)
 * Wraps localStorage so calling code never touches the storage API
 * directly — this is the seam where a real backend will slot in later.
 * -------------------------------------------------------------------- */
const Store = {
  _ns: "drajokesings:",

  read(key, fallback) {
    try {
      const raw = localStorage.getItem(this._ns + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.error(`[Store] failed to read "${key}"`, err);
      return fallback;
    }
  },

  write(key, value) {
    try {
      localStorage.setItem(this._ns + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[Store] failed to write "${key}"`, err);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(this._ns + key);
      return true;
    } catch (err) {
      console.error(`[Store] failed to remove "${key}"`, err);
      return false;
    }
  },
};

function genId(prefix) {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const time = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${time}${rand}`;
}

function escapeForSearch(str) {
  return str.toLowerCase().normalize("NFKD");
}

/* ----------------------------------------------------------------------
 * api — the seam between UI and data.
 * Every method returns a Promise and has a simulated network delay; a
 * subset also has real validation-driven failure modes, so calling code
 * demonstrably handles error states, not just the happy path.
 * -------------------------------------------------------------------- */
const api = {
  // Published admin content has to be merged into DB (content.js) before
  // anything reads it, and every read passes through here first.
  async _delay(ms = 380) {
    if (window.ContentReady) await window.ContentReady;
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /* ---- Artist / homepage ---- */
  async getArtist() {
    await this._delay(200);
    return DB.artists[0];
  },

  async getFeaturedTrack() {
    await this._delay();
    const track = DB.tracks.find((t) => t.featured) || DB.tracks[0];
    const album = DB.albums.find((a) => a.id === track.albumId);
    return { ...track, albumTitle: album ? album.title : null };
  },

  // null until there is an album to feature (every release so far is a single).
  async getFeaturedAlbum() {
    await this._delay(300);
    const album = DB.albums[0];
    if (!album) return null;
    const tracks = album.trackIds.map((id) => DB.tracks.find((t) => t.id === id)).filter(Boolean);
    return { ...album, tracks };
  },

  /* ---- Music ---- */
  async getCatalogue(limit = DB.tracks.length) {
    await this._delay(350);
    return DB.tracks.slice(0, limit);
  },

  async getAllTracks({ query = "", filter = "all" } = {}) {
    await this._delay(340);
    let tracks = [...DB.tracks];
    if (filter === "singles") tracks = tracks.filter((t) => t.isSingle);
    if (filter === "albums") tracks = tracks.filter((t) => !t.isSingle);
    if (query.trim()) {
      const q = escapeForSearch(query.trim());
      tracks = tracks.filter((t) => escapeForSearch(t.title).includes(q) || escapeForSearch(t.artist).includes(q));
    }
    return tracks.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
  },

  async getTrackById(id) {
    await this._delay(280);
    const track = DB.tracks.find((t) => t.id === id);
    if (!track) throw new Error("That song couldn't be found.");
    const album = track.albumId ? DB.albums.find((a) => a.id === track.albumId) : null;
    return { ...track, album };
  },

  async getAllAlbums() {
    await this._delay(320);
    return DB.albums.map((a) => ({ ...a, trackCount: a.trackIds.length }));
  },

  async getAlbumById(id) {
    await this._delay(300);
    const album = DB.albums.find((a) => a.id === id);
    if (!album) throw new Error("That album couldn't be found.");
    const tracks = album.trackIds.map((tid) => DB.tracks.find((t) => t.id === tid)).filter(Boolean);
    return { ...album, tracks };
  },

  /* ---- Videos: live from her YouTube channel (see DB.youtube) ---- */
  // The homepage slot shows the video featured in the admin, else the newest.
  async getVideos(limit = 3) {
    const all = await this._youtube();
    return [...all.filter((v) => v.featured), ...all.filter((v) => !v.featured)].slice(0, limit);
  },

  async getAllVideos({ category = "all" } = {}) {
    const videos = await this._youtube();
    return category === "all" ? videos : videos.filter((v) => v.category === category);
  },

  async getVideoCategories() {
    return [...new Set((await this._youtube()).map((v) => v.category))];
  },

  // Live feed merged over the snapshot, newest first; loaded once per page
  // and shared by every caller.
  _youtube() {
    if (!this._youtubeLoad) this._youtubeLoad = this._loadYouTube();
    return this._youtubeLoad;
  },

  async _loadYouTube() {
    const cached = Store.read("youtube", null);
    const fresh = cached && Date.now() - cached.at < DB.youtube.cacheMinutes * 60000;
    let live = fresh ? cached.videos : null;
    if (!live) {
      try {
        live = await this._fetchYouTubeFeed();
        Store.write("youtube", { at: Date.now(), videos: live });
      } catch (err) {
        console.warn("[api] YouTube feed unreachable, showing the snapshot", err);
        live = cached ? cached.videos : [];
      }
    }
    // The feed has the newest title and date; what the admin set on a video
    // (its own title or category, hidden, featured) stays on top of it.
    const byId = new Map();
    [...live, ...DB.videos].forEach((v) => {
      const seen = byId.get(v.youtubeId);
      byId.set(v.youtubeId, seen ? { ...v, ...seen } : v);
    });
    return [...byId.values()]
      .filter((v) => !v.hidden)
      .map((v) => this._videoFromYouTube(v))
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  // YouTube serves the feed without CORS headers, so a browser can't read
  // it directly; rss2json relays it as JSON (free tier: the newest 10
  // items, refreshed about every half hour). To drop the relay, replace
  // this one method with the YouTube Data API or a small serverless
  // function returning the same { youtubeId, published, title } list.
  async _fetchYouTubeFeed() {
    const feed = `https://www.youtube.com/feeds/videos.xml?channel_id=${DB.youtube.channelId}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}`, { signal: ctrl.signal });
      const body = await res.json();
      if (!res.ok || body.status !== "ok") throw new Error(body.message || `HTTP ${res.status}`);
      return body.items
        .filter((item) => !/\/shorts\//.test(item.link)) // Shorts are vertical clips, not library videos
        .map((item) => ({
          youtubeId: String(item.guid || "").replace("yt:video:", ""),
          published: String(item.pubDate || "").slice(0, 10),
          title: item.title,
        }))
        .filter((v) => /^[\w-]{11}$/.test(v.youtubeId) && /^\d{4}-\d{2}-\d{2}$/.test(v.published));
    } finally {
      clearTimeout(timer);
    }
  },

  // Feed entry -> what the pages render. The page is already hers, so the
  // channel name comes out of titles ("You are God - DrAjokesings").
  _videoFromYouTube(v) {
    const title = this._decode(v.title)
      .replace(/\s*[-–—]\s*Dr\.?\s*Ajoke\s*Sings\b/i, "")
      .replace(/^Dr\.?\s*Ajoke\s*Sings\s*[-–—]\s*/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return {
      id: `yt-${v.youtubeId}`,
      youtubeId: v.youtubeId,
      title: v.customTitle || title,
      category: v.customCategory || v.category || this._videoCategory(title),
      date: v.published,
      url: `https://www.youtube.com/watch?v=${v.youtubeId}`,
      featured: Boolean(v.featured),
    };
  },

  // Filed by what the title says, so a new upload lands in a category
  // without anyone tagging it. Order matters: an audition filmed for
  // SPAW is Talent Quest; a performance at SPAW is the concert.
  _videoCategory(title) {
    if (/audition|interview|talent quest/i.test(title)) return "Talent Quest";
    if (/\bSPAW\b|symphony of praise/i.test(title)) return "SPAW Global Concert";
    if (/\blive\b|performance/i.test(title)) return "Live";
    return "Music";
  },

  _decode(s) {
    const map = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", "#39": "'" };
    return String(s).replace(/&(amp|quot|apos|lt|gt|#39);/g, (m, e) => map[e]);
  },

  /* ---- Galleries (media.html) ---- */
  async getGalleries() {
    await this._delay(300);
    return DB.galleries;
  },

  /* ---- Ministry / Emerging Artists ---- */
  async getEmergingArtists() {
    await this._delay(260);
    return DB.emergingArtists;
  },

  async getMinistryContent() {
    await this._delay(280);
    return DB.ministry;
  },

  /* ---- Symphony / Talent Quest ---- */
  async getSymphonyInfo() {
    await this._delay(260);
    return DB.symphony;
  },

  // Open unless the admin has switched them off or the closing date is past.
  applicationsOpen() {
    const s = DB.symphony || {};
    if (s.applicationsOpen === false) return false;
    if (s.applicationCloses && new Date(`${s.applicationCloses}T23:59:59`).getTime() < Date.now()) return false;
    return true;
  },

  // files: File objects from the upload fields, each tagged .kind "audio" or
  // "video". Live they upload to the private applications folder first.
  async submitTalentApplication(payload, files = []) {
    await this._delay(300);
    const required = ["fullName", "email", "phone", "gender", "ageCategory", "state", "country", "location", "track", "bio"];
    const missing = required.filter((key) => !payload[key] || !String(payload[key]).trim());
    if (missing.length) throw new Error("Please complete all required fields before submitting.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error("That email address doesn't look right.");
    if (!payload.agreedToTerms) throw new Error("You need to agree to the terms to submit your application.");
    if (!this.applicationsOpen()) throw new Error("Applications for this Talent Quest are closed.");
    const application = await Backend.forms.submitApplication(payload, files);
    if (window.Track) Track.event("applied", { label: payload.track });
    Backend.email.send("applications", application.id); // "application received"
    return application;
  },

  async getTalentApplications() {
    await this._delay(0);
    return Backend.forms.list("applications");
  },

  /* ---- Events ----
   * registered: live, the real number of registrations; in demo mode, the
   * sample figure in DB plus the registrations made in this browser. */
  async _withCounts(events) {
    let counts = {};
    try { counts = await Backend.forms.eventCounts(); } catch (err) { console.warn("[api] registration counts unavailable:", err.message); }
    const live = Backend.mode === "live";
    return events.map((e) => ({ ...e, registered: (live ? 0 : (e.registered || 0)) + (counts[e.id] || 0) }));
  },

  // Where an event stands for registration. The database checks the same
  // things when someone registers (register_for_event, setup-3.sql); dates
  // are Lagos dates.
  eventState(e) {
    const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
    const lastDay = e.endDate || e.date;
    if (e.visible === false) return { open: false, label: "Not announced yet", reason: "This event isn't open for registration." };
    if (e.status === "cancelled") return { open: false, label: "Cancelled", reason: "This event has been cancelled." };
    if (e.status === "postponed") return { open: false, label: "Postponed", reason: "This event has been postponed. Registration reopens with the new date." };
    if (lastDay && lastDay < today) return { open: false, label: "Event over", reason: "This event has already taken place." };
    // Marked sold out in the admin, or every place taken.
    if (e.soldOut === true || (Number(e.capacity) > 0 && Number(e.registered) >= Number(e.capacity))) {
      return { open: false, label: "Sold out", reason: "Sorry, this event is sold out: every place has been taken." };
    }
    if (e.registrationOpen === false) return { open: false, label: "Registration closed", reason: "Registration for this event is closed." };
    if (e.registrationCloses && today > e.registrationCloses) {
      const on = new Date(`${e.registrationCloses}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      return { open: false, label: "Registration closed", reason: `Registration for this event closed on ${on}.` };
    }
    return { open: true, label: "Register", reason: "" };
  },

  // Events the admin hasn't announced yet ("Show on the website" off) stay off the site.
  _shownEvents() {
    return DB.events.filter((e) => e.visible !== false);
  },

  async getUpcomingEvents(limit = 3) {
    await this._delay(300);
    const now = Date.now();
    return this._withCounts(this._shownEvents()
      .filter((e) => new Date(`${e.endDate || e.date}T${e.endTime || e.time || "00:00"}:00`).getTime() >= now - 86400000)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, limit));
  },

  async getAllEvents() {
    await this._delay(320);
    return this._withCounts([...this._shownEvents()].sort((a, b) => new Date(a.date) - new Date(b.date)));
  },

  async getEventById(id) {
    await this._delay(280);
    const event = this._shownEvents().find((e) => e.id === id);
    if (!event) throw new Error("That event couldn't be found.");
    const [counted] = await this._withCounts([event]);
    return { ...counted, liveRegistered: counted.registered };
  },

  async registerForEvent(eventId, attendee) {
    await this._delay(300);
    const [event] = await this._withCounts(this._shownEvents().filter((e) => e.id === eventId));
    if (!event) throw new Error("That event couldn't be found.");
    if (!attendee.name || !attendee.name.trim()) throw new Error("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendee.email || "")) throw new Error("That email address doesn't look right.");
    const state = this.eventState(event);
    if (!state.open) throw new Error(state.reason);
    // The event's own questions (admin → Events → Registration form). The
    // database checks the same (register_for_event, setup-4.sql).
    const answered = (v) => (v && typeof v === "object" ? Boolean(v.state && v.country) : String(v == null ? "" : v).trim() !== "");
    const phone = event.phone || "optional";
    const clean = { ...attendee, phone: phone === "off" ? "" : String(attendee.phone || "").trim(), answers: Array.isArray(attendee.answers) ? attendee.answers : [] };
    if (phone === "required" && clean.phone.replace(/[^\d]/g, "").length < 7) throw new Error("Enter a phone number.");
    const missing = (event.formFields || []).filter((q) => q && q.required).filter((q) => {
      const a = clean.answers.find((x) => x.id === q.id);
      return !a || !answered(a.value) || (q.type === "checkbox" && a.value !== "Yes");
    });
    if (missing.length) throw new Error(`Please answer: ${missing.map((q) => q.label).join(" · ")}`);
    const registration = await Backend.forms.registerForEvent(event, clean);
    if (window.Track) Track.event("registered", { label: event.name, props: { id: event.id } });
    // The ticket (or confirmation) by email; the success screen says so once it's gone.
    return { ...registration, emailing: Backend.email.send("registrations", registration.id) };
  },

  async getRegistrations(eventId = null) {
    await this._delay(0);
    const all = await Backend.forms.list("registrations");
    return eventId ? all.filter((r) => r.eventId === eventId) : all;
  },

  async checkInRegistration(registrationId) {
    await this._delay(0);
    return Backend.forms.checkIn(registrationId);
  },

  /* ---- Newsletter ---- */
  async subscribeNewsletter(email, source = document.title.split(" — ")[0]) {
    await this._delay(200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn't look right.");
    const result = await Backend.forms.subscribe(email, source);
    if (window.Track) Track.event("newsletter", { label: source });
    Backend.email.send("subscribers", result.email); // a welcome
    return result;
  },

  /* ---- Contact & booking enquiries ----
   * One endpoint serves both modes of contact.html. `type` is either
   * "message" or "booking"; booking mode simply requires more of the
   * payload. Validation returns a field map on the thrown error so the
   * form can mark individual inputs rather than only showing a banner.
   */
  async submitEnquiry(payload) {
    await this._delay(850);
    const fields = {};

    if (!payload.name || !payload.name.trim()) fields.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email || "")) fields.email = "That email address doesn't look right.";
    if (!payload.subject || !payload.subject.trim()) fields.subject = "Add a subject.";
    if (!payload.message || payload.message.trim().length < 20) fields.message = "Tell us a little more — at least 20 characters.";

    if (payload.type === "booking") {
      if (!payload.organisation || !payload.organisation.trim()) fields.organisation = "Who is inviting her?";
      if (!payload.eventType) fields.eventType = "Choose the kind of event.";
      if (!payload.eventDate) fields.eventDate = "Pick a date, even a provisional one.";
      else if (new Date(`${payload.eventDate}T00:00:00`).getTime() < Date.now() - 86400000) fields.eventDate = "That date has already passed.";
      if (!payload.city || !payload.city.trim()) fields.city = "Where is it happening?";
      if (!payload.phone || !payload.phone.trim()) fields.phone = "Add a phone number so the team can reach you.";
    }

    if (Object.keys(fields).length) {
      const err = new Error("Please check the highlighted fields and try again.");
      err.fields = fields;
      throw err;
    }

    const enquiry = await Backend.forms.submitEnquiry(payload);
    Backend.email.send("enquiries", enquiry.id); // "we've got your message / booking request"
    const booking = payload.type === "booking";
    if (window.Track) Track.event(booking ? "booking" : "enquiry", { label: booking ? payload.eventType || "Booking" : "Message" });
    return enquiry;
  },

  async getEnquiries(type = null) {
    await this._delay(0);
    const all = await Backend.forms.list("enquiries");
    return type ? all.filter((e) => e.type === type) : all;
  },

  async getAnalyticsSnapshot() {
    await this._delay(450);
    return Store.read("analyticsSnapshot", null) || seedAnalytics();
  },
};

/* ----------------------------------------------------------------------
 * Deterministic demo analytics — regenerated once per browser and cached,
 * so charts don't visibly reshuffle on every admin page load. Swap for a
 * real analytics query later; shape mirrors a typical time-series API.
 * -------------------------------------------------------------------- */
function seedAnalytics() {
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    visitors: days.map((date) => ({ date, value: Math.round(320 + rand() * 480) })),
    pageViews: days.map((date) => ({ date, value: Math.round(900 + rand() * 1100) })),
    topSongs: DB.tracks
      .map((t) => ({ title: t.title, plays: Math.round(1200 + rand() * 8000) }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 5),
    videoEngagement: DB.videos
      .map((v) => ({ title: v.title, views: Math.round(800 + rand() * 6000) }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5),
    eventStats: DB.events.map((e) => ({
      name: e.name,
      registered: e.registered,
      capacity: e.capacity,
    })),
    talentApplications: Math.round(60 + rand() * 40),
  };
  Store.write("analyticsSnapshot", snapshot);
  return snapshot;
}

// Exposed as globals intentionally: this prototype loads plain <script>
// tags (no bundler). A future migration swaps this file for ES modules
// or real fetch() calls without touching call sites, since the api.*
// method signatures stay identical.
window.DB = DB;
window.Store = Store;
window.api = api;
window.genId = genId;

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
    email: "hello@drajokesings.com",
    bookingEmail: "booking@drajokesings.com",
    social: {
      instagram: "https://instagram.com/drajokesings",
      youtube: "https://youtube.com/@drajokesings",
      tiktok: "https://tiktok.com/@drajokesings",
      twitter: "https://twitter.com/drajokesings",
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

  albums: [
    {
      id: "album-001",
      title: "Covenant",
      year: 2025,
      cover: "assets/images/TGE-3.jpeg",
      banner: "assets/images/TGE-1.jpeg",
      description: "A nine-song record about promises kept in the dark — recorded live with a fourteen-piece ensemble in Lagos.",
      trackIds: ["track-001", "track-002", "track-003", "track-004"],
    },
    {
      id: "album-002",
      title: "Threshold",
      year: 2022,
      cover: "assets/images/motion-2.jpeg",
      banner: "assets/images/TGE-2.jpeg",
      description: "The record that crossed borders — worship reimagined through highlife rhythm and orchestral strings.",
      trackIds: ["track-005", "track-006"],
    },
  ],

  tracks: [
    {
      id: "track-001",
      title: "Alagbara",
      artist: "Dr AjokeSings",
      albumId: "album-001",
      releaseDate: "2025-03-14",
      duration: 274,
      description: "Recorded live at the Glory Experience, featuring Pelumi Deborah — a declaration of the God who is mighty, carried by the full house band.",
      lyrics: [
        "Alagbara l'Olorun mi",
        "Mighty is the God I serve",
        "There is no one like You",
        "Alagbara, Alagbara",
        "",
        "You go before me, You never fail",
        "Every battle already won",
        "Alagbara l'Olorun mi",
        "Mighty God, mighty God",
      ],
      artwork: "assets/images/Alagbara.jpeg",
      audioSrc: "assets/audio/sample-01.mp3",
      links: { spotify: "#", appleMusic: "#", youtube: "#", boomplay: "#", audiomack: "#", deezer: "#", amazonMusic: "#" },
      featured: true,
      isSingle: false,
    },
    {
      id: "track-002",
      title: "Awesome Forever",
      artist: "Dr AjokeSings",
      albumId: "album-001",
      releaseDate: "2025-03-14",
      duration: 231,
      description: "A declaration set against talking drum and strings — He was, He is, and He remains awesome forever.",
      lyrics: ["You are awesome forever", "Faithful when I forget my own name", "You are awesome forever", "Still the same, still the same"],
      artwork: "assets/images/Awesome-forever.jpeg",
      audioSrc: "assets/audio/sample-02.mp3",
      links: { spotify: "#", appleMusic: "#", youtube: "#", boomplay: "#", audiomack: "#", deezer: "#", amazonMusic: "#" },
      featured: false,
      isSingle: false,
    },
    {
      id: "track-003",
      title: "You Are God",
      artist: "Dr AjokeSings",
      albumId: "album-001",
      releaseDate: "2025-03-14",
      duration: 198,
      description: "A quiet processional built around one sustained line, sung until the room believes it.",
      lyrics: ["You are God, You are God", "Before the mountains, You are God", "When the answer has not come", "You are God, You are God"],
      artwork: "assets/images/you-are-god.jpeg",
      audioSrc: "assets/audio/sample-03.mp3",
      links: { spotify: "#", appleMusic: "#", youtube: "#", boomplay: "#", audiomack: "#", deezer: "#", amazonMusic: "#" },
      featured: false,
      isSingle: false,
    },
    {
      id: "track-004",
      title: "Every Mountain",
      artist: "Dr AjokeSings",
      albumId: "album-001",
      releaseDate: "2025-03-14",
      duration: 256,
      description: "An anthem for the long climb, co-written with the Covenant Choir.",
      lyrics: ["Every mountain has Your fingerprint", "Every valley knows Your voice", "So I will climb, I will not faint", "Every mountain, I rejoice"],
      artwork: "assets/images/motion-2.jpeg",
      audioSrc: "assets/audio/sample-04.mp3",
      links: { spotify: "#", appleMusic: "#", youtube: "#", boomplay: "#", audiomack: "#", deezer: "#", amazonMusic: "#" },
      featured: false,
      isSingle: false,
    },
    {
      id: "track-005",
      title: "Threshold",
      artist: "Dr AjokeSings",
      albumId: "album-002",
      releaseDate: "2022-09-02",
      duration: 243,
      description: "The doorway song — recorded in one take at midnight.",
      lyrics: ["I'm standing at the threshold", "One foot in the old, one foot in the new", "So I lift my hands at the threshold", "And I walk on through"],
      artwork: "assets/images/TGE-3.jpeg",
      audioSrc: "assets/audio/sample-05.mp3",
      links: { spotify: "#", appleMusic: "#", youtube: "#", boomplay: "#", audiomack: "#", deezer: "#", amazonMusic: "#" },
      featured: false,
      isSingle: false,
    },
    {
      id: "track-006",
      title: "Highlife Hallelujah",
      artist: "Dr AjokeSings",
      albumId: "album-002",
      releaseDate: "2022-09-02",
      duration: 219,
      description: "Joy set to a highlife groove — the record's most-requested live moment.",
      lyrics: ["Hallelujah, hallelujah", "The band is playing and my feet won't stay", "Hallelujah, hallelujah", "Joy came early and it came to stay"],
      artwork: "assets/images/motion.jpeg",
      audioSrc: "assets/audio/sample-06.mp3",
      links: { spotify: "#", appleMusic: "#", youtube: "#", boomplay: "#", audiomack: "#", deezer: "#", amazonMusic: "#" },
      featured: false,
      isSingle: false,
    },
    {
      id: "track-007",
      title: "Steady Hands",
      artist: "Dr AjokeSings",
      albumId: null,
      releaseDate: "2026-06-20",
      duration: 207,
      description: "A standalone single written for a friend walking through chemotherapy — released with zero promotion, just love.",
      lyrics: ["Steady hands, unshaken heart", "You have held me from the start", "Steady hands, I won't let go", "Even when I do not know"],
      artwork: "assets/images/TGE-2.jpeg",
      audioSrc: "assets/audio/sample-01.mp3",
      links: { spotify: "#", appleMusic: "#", youtube: "#", boomplay: "#", audiomack: "#", deezer: "#", amazonMusic: "#" },
      featured: false,
      isSingle: true,
    },
    {
      id: "track-008",
      title: "Homecoming",
      artist: "Dr AjokeSings",
      albumId: null,
      releaseDate: "2026-01-11",
      duration: 264,
      description: "The first single of the year — a song about returning to faith after a long, quiet season away.",
      lyrics: ["I'm coming home, I'm coming home", "The road was long but I'm not alone", "I'm coming home, table's still set", "Grace never once forgot my name"],
      artwork: "assets/images/motion-1.jpeg",
      audioSrc: "assets/audio/sample-02.mp3",
      links: { spotify: "#", appleMusic: "#", youtube: "#", boomplay: "#", audiomack: "#", deezer: "#", amazonMusic: "#" },
      featured: false,
      isSingle: true,
    },
  ],

  videos: [
    {
      id: "video-001",
      title: "Awesome Forever — Live at the Glory Experience",
      category: "Live Performance",
      thumbnail: "assets/images/TGE-1.jpeg",
      videoSrc: "assets/video/glory-experience-teaser.mp4",
      duration: 312,
      date: "2025-04-02",
      description: "Recorded live at the Covenant album listening night, full band, single take.",
    },
    {
      id: "video-002",
      title: "The Making of Covenant",
      category: "Behind the Scenes",
      thumbnail: "assets/images/motion-3.jpeg",
      videoSrc: "assets/video/glory-experience-teaser.mp4",
      duration: 480,
      date: "2025-03-01",
      description: "Inside the studio sessions with the fourteen-piece ensemble.",
    },
    {
      id: "video-003",
      title: "Alagbara ft. Pelumi Deborah — Official Video",
      category: "Music Video",
      thumbnail: "assets/images/Alagbara-landscape.jpeg",
      videoSrc: "assets/video/glory-experience-teaser.mp4",
      duration: 274,
      date: "2025-03-20",
      description: "Shot across three cities in a single week.",
    },
    {
      id: "video-004",
      title: "Sunrise Worship Session, Vol. 3",
      category: "Worship Session",
      thumbnail: "assets/images/motion-4.jpeg",
      videoSrc: "assets/video/glory-experience-teaser.mp4",
      duration: 620,
      date: "2026-02-14",
      description: "An unedited, one-take worship session recorded at first light.",
    },
    {
      id: "video-005",
      title: "On Grief and Songwriting",
      category: "Interview",
      thumbnail: "assets/images/motion-2.jpeg",
      videoSrc: "assets/video/glory-experience-teaser.mp4",
      duration: 940,
      date: "2025-05-18",
      description: "A long-form conversation on the season that produced Covenant.",
    },
    {
      id: "video-006",
      title: "Threshold — Anniversary Recap",
      category: "Ministry Content",
      thumbnail: "assets/images/motion-5.jpeg",
      videoSrc: "assets/video/glory-experience-teaser.mp4",
      duration: 205,
      date: "2025-09-10",
      description: "Three years of Threshold, revisited through the community that carried it.",
    },
    {
      id: "video-007",
      title: "Highlife Hallelujah — Official Video",
      category: "Music Video",
      thumbnail: "assets/images/Violinist.jpeg",
      videoSrc: "assets/video/glory-experience-teaser.mp4",
      duration: 219,
      date: "2022-09-10",
      description: "Shot in one afternoon on the streets of Lagos Island.",
    },
    {
      id: "video-008",
      title: "Symphony 2025 — Finalist Showcase",
      category: "Live Performance",
      thumbnail: "assets/images/spaw-stage-02.webp",
      videoSrc: "assets/video/glory-experience-teaser.mp4",
      duration: 1380,
      date: "2025-12-01",
      description: "The full showcase night from last year's Symphony of Praise & Worship cohort.",
    },
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
    description: "Symphony of Praise & Worship is a concert and a talent quest running on the same calendar. The night itself is a full-length worship gathering built around the house band and the room. The Quest is how the newest voices on that stage are found.",
    // SPAW 2026, as printed on the official flyer: the Talent Quest on
    // Friday 27 November and the concert the next day, both at Regal Hall.
    // The flyer gives no times, so doors/start stay null (shown as "to be
    // announced") until the organisers confirm them.
    applicationOpens: "2026-08-01",
    applicationCloses: "2026-11-01",
    questDate: "2026-11-27",
    tracks: ["Vocalist", "Songwriter", "Instrumentalist", "Producer"],

    concert: {
      eventId: "event-004",
      name: "Symphony of Praise & Worship — The Concert",
      date: "2026-11-28",
      doors: null,
      start: null,
      venue: "Regal Hall, Daystar Christian Center",
      city: "Oregun, Ikeja, Lagos",
      capacity: 800,
      admission: "Free entry — registration required",
      description: "One long room, a fourteen-piece house band, and eight hundred people who came to sing rather than to watch. The set runs without an interval, moving from the Covenant material through to the new songs, and the Talent Quest finalists open the night on the same stage and the same band.",
      highlights: [
        { title: "The house band", body: "Fourteen pieces — strings, horns, talking drum, and the rhythm section that cut Covenant live in Lagos." },
        { title: "One continuous set", body: "No interval and no support slot in the usual sense. The room stays in it from the first note to the last." },
        { title: "The finalists open", body: "The Talent Quest class of 2026 takes the first half hour, backed by the same band, on the same stage." },
        { title: "Free, but registered", body: "Entry costs nothing. Registration is capped at eight hundred, and it closes when the room is full." },
      ],
    },

    quest: {
      title: "The Talent Quest",
      tagline: "A yearly search for the next generation of worship voices.",
      description: "Four tracks, one cohort, and one clear prize: your own recording, finished properly, and a place on the Symphony stage in front of a full house. The Quest is held live at Regal Hall, Daystar Christian Center, the day before the concert, and every applicant hears back, whichever way the answer goes.",
      benefits: [
        { title: "Funded studio time", body: "Studio days toward one original recording, cut with the Symphony house team in Lagos." },
        { title: "The Symphony stage", body: "A performance slot at the Symphony concert, backed by the full fourteen-piece band." },
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
      description: "The SPAW Talent Quest, live: this year's applicants take the stage, the day before the concert.",
      image: "assets/images/spaw-stage-01.webp",
      ticketRequired: true,
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
      name: "Symphony of Praise & Worship — The Concert",
      venue: "Regal Hall, Daystar Christian Center",
      city: "Oregun, Ikeja, Lagos",
      date: "2026-11-28",
      time: null, // not yet announced
      capacity: 800,
      registered: 122,
      description: "One night of worship with the full house band, opened by this year's Talent Quest finalists.",
      image: "assets/images/spaw-duet.webp",
      ticketRequired: true,
    },
  ],

  announcements: [
    {
      id: "ann-001",
      title: "Applications for Symphony 2026 are open",
      date: "2026-08-01",
      body: "This year's Symphony of Praise & Worship cohort opens for applications through November 1st.",
    },
    {
      id: "ann-002",
      title: "Covenant multitracks now free for local churches",
      date: "2026-05-02",
      body: "The full Threshold live-session multitracks are now available in the ministry resource library.",
    },
  ],
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
  _delay(ms = 380) {
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
    return { ...track, albumTitle: album ? album.title : "Single" };
  },

  async getFeaturedAlbum() {
    await this._delay(300);
    const album = DB.albums[0];
    const tracks = album.trackIds.map((id) => DB.tracks.find((t) => t.id === id)).filter(Boolean);
    return { ...album, tracks };
  },

  /* ---- Music ---- */
  async getCatalogue(limit = 8) {
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

  /* ---- Videos ---- */
  async getVideos(limit = 3) {
    await this._delay(320);
    return DB.videos.slice(0, limit);
  },

  async getAllVideos({ category = "all" } = {}) {
    await this._delay(360);
    let videos = [...DB.videos];
    if (category !== "all") videos = videos.filter((v) => v.category === category);
    return videos.sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  async getVideoCategories() {
    await this._delay(120);
    return [...new Set(DB.videos.map((v) => v.category))];
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

  async submitTalentApplication(payload) {
    await this._delay(900);
    const required = ["fullName", "email", "phone", "location", "track", "bio"];
    const missing = required.filter((key) => !payload[key] || !String(payload[key]).trim());
    if (missing.length) throw new Error("Please complete all required fields before submitting.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error("That email address doesn't look right.");
    if (!payload.agreedToTerms) throw new Error("You need to agree to the terms to submit your application.");

    const applications = Store.read("talentApplications", []);
    const application = {
      id: genId("SYM"),
      submittedAt: new Date().toISOString(),
      status: "Received",
      ...payload,
    };
    applications.push(application);
    Store.write("talentApplications", applications);
    return application;
  },

  async getTalentApplications() {
    await this._delay(260);
    return Store.read("talentApplications", []);
  },

  /* ---- Events ---- */
  async getUpcomingEvents(limit = 3) {
    await this._delay(300);
    const now = Date.now();
    return DB.events
      .filter((e) => new Date(`${e.date}T${e.time || "00:00"}:00`).getTime() >= now - 86400000)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, limit);
  },

  async getAllEvents() {
    await this._delay(320);
    return [...DB.events].sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  async getEventById(id) {
    await this._delay(280);
    const event = DB.events.find((e) => e.id === id);
    if (!event) throw new Error("That event couldn't be found.");
    const regs = Store.read("registrations", []).filter((r) => r.eventId === id);
    return { ...event, liveRegistered: event.registered + regs.length };
  },

  async registerForEvent(eventId, attendee) {
    await this._delay(700);
    const event = DB.events.find((e) => e.id === eventId);
    if (!event) throw new Error("That event couldn't be found.");
    if (!attendee.name || !attendee.name.trim()) throw new Error("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendee.email || "")) throw new Error("That email address doesn't look right.");

    const registrations = Store.read("registrations", []);
    const duplicate = registrations.find((r) => r.eventId === eventId && r.email.toLowerCase() === attendee.email.toLowerCase());
    if (duplicate) throw new Error("You're already registered for this event with that email.");

    const registration = {
      id: genId("REG"),
      eventId,
      eventName: event.name,
      name: attendee.name.trim(),
      email: attendee.email.trim(),
      phone: attendee.phone ? attendee.phone.trim() : "",
      registeredAt: new Date().toISOString(),
      checkedIn: false,
      checkedInAt: null,
    };
    registrations.push(registration);
    Store.write("registrations", registrations);
    return registration;
  },

  async getRegistrations(eventId = null) {
    await this._delay(260);
    const all = Store.read("registrations", []);
    return eventId ? all.filter((r) => r.eventId === eventId) : all;
  },

  async checkInRegistration(registrationId) {
    await this._delay(500);
    const registrations = Store.read("registrations", []);
    const reg = registrations.find((r) => r.id === registrationId.trim());
    if (!reg) throw new Error("No registration found with that ID.");
    if (reg.checkedIn) throw new Error(`Already checked in at ${new Date(reg.checkedInAt).toLocaleTimeString()}.`);
    reg.checkedIn = true;
    reg.checkedInAt = new Date().toISOString();
    Store.write("registrations", registrations);
    return reg;
  },

  /* ---- Newsletter ---- */
  async subscribeNewsletter(email) {
    await this._delay(500);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn't look right.");
    const list = Store.read("newsletter", []);
    if (list.includes(email)) throw new Error("You're already on the list.");
    list.push(email);
    Store.write("newsletter", list);
    return { email };
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

    const enquiries = Store.read("enquiries", []);
    const enquiry = {
      id: genId(payload.type === "booking" ? "BKG" : "MSG"),
      submittedAt: new Date().toISOString(),
      status: "New",
      ...payload,
    };
    enquiries.push(enquiry);
    Store.write("enquiries", enquiries);
    return enquiry;
  },

  async getEnquiries(type = null) {
    await this._delay(260);
    const all = Store.read("enquiries", []);
    return type ? all.filter((e) => e.type === type) : all;
  },

  /* ---- Admin: session ---- */
  async adminLogin(username, password) {
    await this._delay(600);
    // Prototype-only credential check. No real auth, no secrets of value —
    // this exists purely to demonstrate the login -> validate -> session
    // journey, and is clearly not production authentication.
    if (username.trim().toLowerCase() === "admin" && password === "symphony2026") {
      const session = { username: "admin", loggedInAt: new Date().toISOString() };
      Store.write("adminSession", session);
      return session;
    }
    throw new Error("Incorrect username or password.");
  },

  async getAdminSession() {
    return Store.read("adminSession", null);
  },

  adminLogout() {
    Store.remove("adminSession");
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

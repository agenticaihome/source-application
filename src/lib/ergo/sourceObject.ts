/**
 * Data models for Source Application
 * 
 * This module defines the core interfaces for the decentralized File Discovery 
 * and Verification system built on Ergo blockchain.
 */


// --- SOURCE ENTRY (Individual source tuple from R9) ---
// Represents a single source entry within a FILE_SOURCE box.
// Each entry maps to a tuple in the Coll[Coll[Byte]] structure:
// (hash_function_id, content_format, content_hash, raw_format, url_link)
//
// Format fields (contentFormat, rawFormat) accept EITHER:
//   - A simple file extension string, e.g. ".tar.gz"
//   - A hash/box ID referencing a skill format definition
//     (per https://github.com/celaut-project/skills)
// The consumer determines interpretation.
export interface SourceEntry {
    hashFunctionId: string;       // Hash function identifier (HASH(EMPTY_INPUT))
    contentFormat: string;        // Content file format extension (e.g. ".tar.gz") or format box ID
    contentHash: string;          // Hash of the content at the URL
    rawFormat: string;            // Raw (uncompressed) file format extension or format box ID
    urlLink: string;              // The download URL
    isChunked?: boolean;          // If true, urlLink points to a manifest of chunk URLs (default false)
}

// --- FILE_SOURCE (Box Type 1) ---
// Represents a set of download sources for a file with a specific raw hash.
export interface FileSource {
    id: string;              // Box ID of the source
    fileHash: string;        // R5: Raw file hash digest (the anchor - users search by this)
    hashFunctionId: string;  // ID of hash function used (HASH(EMPTY_INPUT))
    source: SourceEntry;    // R9: Single source entry (parsed from Coll[Coll[Byte]])
    ownerTokenId: string;    // Reputation Token ID from assets[0]
    reputationAmount: number; // Amount of reputation tokens in this box
    timestamp: number;       // Block timestamp
    isLocked: boolean;       // R6: Always false (unlocked) for this app
    transactionId: string;   // Transaction ID
}

// --- INVALID_FILE_SOURCE (Box Type 4) ---
// Represents an opinion that a specific FILE_SOURCE box is fake or incorrect.
export interface InvalidFileSource {
    id: string;              // Box ID of this opinion
    targetBoxId: string;     // R5: The specific box ID being invalidated
    authorTokenId: string;   // Reputation Token ID from assets[0]
    reputationAmount: number; // Token amount (weight)
    timestamp: number;       // Block timestamp
    transactionId: string;   // Transaction ID
}

// --- UNAVAILABLE_SOURCE (Box Type 5) ---
// Represents an opinion that a specific URL is no longer available.
export interface UnavailableSource {
    id: string;              // Box ID of this opinion
    sourceUrl: string;       // R5: The URL being marked as unavailable
    authorTokenId: string;   // Reputation Token ID from assets[0]
    reputationAmount: number; // Token amount (weight)
    timestamp: number;       // Block timestamp
    transactionId: string;   // Transaction ID
}

// --- PROFILE_OPINION (Box Type 3) ---
// Represents trusting a User/Profile rather than a specific box.
// Provides persistent trust mechanism when sources update.
export interface ProfileOpinion {
    id: string;              // Box ID of the opinion
    targetProfileTokenId: string; // R5: Reputation Token ID of the user being trusted
    isTrusted: boolean;      // R8: true=trust, false=distrust
    authorTokenId: string;   // Reputation Token ID from assets[0] (who is giving the opinion)
    reputationAmount: number; // Token amount (trust weight)
    timestamp: number;       // Block timestamp
    transactionId: string;   // Transaction ID
}

// --- TIMELINE DATA STRUCTURES ---

export interface TimelineEvent {
    timestamp: number;
    type: 'FILE_SOURCE' | 'INVALID_FILE_SOURCE' | 'UNAVAILABLE_SOURCE' | 'PROFILE_OPINION';
    label: string;
    color: string;
    authorTokenId?: string;
    data: any;
}

export interface SearchResult {
    sources: FileSource[];
    invalidations: { [sourceId: string]: InvalidFileSource[] };
    unavailabilities: { [sourceUrl: string]: UnavailableSource[] };
}

export interface ProfileData {
    sources: FileSource[];
    invalidations: InvalidFileSource[];
    unavailabilities: UnavailableSource[];
    opinions: ProfileOpinion[];
    opinionsGiven: ProfileOpinion[];
}

export interface CachedData<T> {
    [key: string]: {
        data: T;
        timestamp: number;
    }
}

// --- AGGREGATED DATA STRUCTURES ---

/**
 * File source with aggregated opinion data
 */
export interface FileSourceWithScore extends FileSource {
    confirmations: FileSource[];      // Other FILE_SOURCE boxes with same hash and URL
    invalidations: InvalidFileSource[]; // INVALID_FILE_SOURCE boxes for this boxId
    unavailabilities: UnavailableSource[]; // UNAVAILABLE_SOURCE boxes for URLs in sources

    confirmationScore: number; // Sum of reputation in confirmations
    invalidationScore: number; // Sum of reputation in invalidations
    unavailabilityScore: number; // Sum of reputation in unavailabilities

    ownerTrustScore: number; // Trust score of the source owner
}

// --- GROUPED DATA STRUCTURES ---

/**
 * Data for a unique download source (URL)
 */
export interface DownloadSourceGroup {
    sourceUrl: string;
    sources: FileSource[]; // All FILE_SOURCE boxes containing this URL
    owners: string[];      // Unique owner token IDs
    invalidations: InvalidFileSource[]; // All invalidations for all sources in this group
    unavailabilities: UnavailableSource[]; // All unavailabilities for this URL
}

/**
 * Data for a specific profile's contributions to a hash
 */
export interface ProfileSourceGroup {
    profileTokenId: string;
    sources: FileSource[]; // FILE_SOURCE boxes by this profile
    // Each source in this group will have its own invalidations and unavailabilities
}

// --- HELPER FUNCTIONS ---

/**
 * Get the primary URL from a FileSource.
 * Returns the first source entry's URL, or an empty string if no sources.
 */
export function getPrimaryUrl(source: FileSource): string {
    return source.source?.urlLink || '';
}

/**
 * Get all URLs from a FileSource.
 * With single source entry, returns an array with one URL.
 */
export function getAllUrls(source: FileSource): string[] {
    return source.source?.urlLink ? [source.source.urlLink] : [];
}

/**
 * Group file sources by their download URLs.
 * A FileSource can contain multiple URLs; it will appear in each group.
 */
export function groupByDownloadSource(
    sources: FileSource[],
    invalidationsMap: Record<string, { data: InvalidFileSource[] }>,
    unavailabilitiesMap: Record<string, { data: UnavailableSource[] }>
): DownloadSourceGroup[] {
    const groups: Record<string, DownloadSourceGroup> = {};

    for (const source of sources) {
        const url = source.source?.urlLink;
        if (!url) continue;

        if (!groups[url]) {
            groups[url] = {
                sourceUrl: url,
                sources: [],
                owners: [],
                invalidations: [],
                unavailabilities: unavailabilitiesMap[url]?.data || []
            };
        }

        // Avoid duplicating the same source in the same group
        if (!groups[url].sources.some(s => s.id === source.id)) {
            groups[url].sources.push(source);
        }
        if (!groups[url].owners.includes(source.ownerTokenId)) {
            groups[url].owners.push(source.ownerTokenId);
        }

        // Add invalidations for this specific box
        const boxInvalidations = invalidationsMap[source.id]?.data || [];
        groups[url].invalidations.push(...boxInvalidations);
    }

    return Object.values(groups).sort((a, b) => b.sources.length - a.sources.length);
}

/**
 * Group file sources by the profile that submitted them.
 */
export function groupByProfile(sources: FileSource[]): ProfileSourceGroup[] {
    const groups: Record<string, ProfileSourceGroup> = {};

    for (const source of sources) {
        if (!groups[source.ownerTokenId]) {
            groups[source.ownerTokenId] = {
                profileTokenId: source.ownerTokenId,
                sources: []
            };
        }
        groups[source.ownerTokenId].sources.push(source);
    }

    return Object.values(groups).sort((a, b) => b.sources.length - a.sources.length);
}

/**
 * Calculate the trust score for a profile based on PROFILE_OPINION boxes.
 */
export function calculateProfileTrust(
    profileTokenId: string,
    opinions: ProfileOpinion[]
): number {
    const trust = opinions
        .filter(op => op.isTrusted)
        .reduce((sum, op) => sum + op.reputationAmount, 0);

    const distrust = opinions
        .filter(op => !op.isTrusted)
        .reduce((sum, op) => sum + op.reputationAmount, 0);

    return trust - distrust;
}

/**
 * Aggregate opinions into score data for a file source.
 */
export function aggregateSourceScore(
    source: FileSource,
    allSources: FileSource[],
    invalidations: InvalidFileSource[],
    unavailabilities: UnavailableSource[],
    profileOpinions: ProfileOpinion[] = []
): FileSourceWithScore {
    // Confirmations are other sources with same hash and same URL
    const sourceUrl = source.source?.urlLink || '';
    const confirmations = allSources.filter(s =>
        s.id !== source.id &&
        s.fileHash === source.fileHash &&
        s.source?.urlLink === sourceUrl
    );

    // Invalidations for this specific box
    const filteredInvalidations = invalidations.filter(inv => inv.targetBoxId === source.id);

    // Unavailabilities for the URL in this source
    const filteredUnavailabilities = unavailabilities.filter(un => un.sourceUrl === sourceUrl);

    const confirmationScore = confirmations.reduce((sum, s) => sum + s.reputationAmount, 0);
    const invalidationScore = filteredInvalidations.reduce((sum, inv) => sum + inv.reputationAmount, 0);
    const unavailabilityScore = filteredUnavailabilities.reduce((sum, un) => sum + un.reputationAmount, 0);

    const ownerTrustScore = calculateProfileTrust(source.ownerTokenId, profileOpinions);

    return {
        ...source,
        confirmations,
        invalidations: filteredInvalidations,
        unavailabilities: filteredUnavailabilities,
        confirmationScore,
        invalidationScore,
        unavailabilityScore,
        ownerTrustScore
    };
}

// --- SERIALIZATION HELPERS ---

/**
 * Serialize source entries to a JSON string for R9 content.
 * The reputation-system library encodes this as Coll[Byte] (UTF-8 bytes).
 * 
 * Format: Coll[Coll[Byte]] — a JSON array containing one tuple (array):
 * [hash_function_id, content_format, content_hash, raw_format, url_link, is_chunked]
 * 
 * Note: The tuple mixes string and boolean types (isChunked is boolean).
 * This works because the entire JSON string is serialized to UTF-8 bytes
 * (Coll[Byte]) by the reputation-system library — the Ergo Coll[Byte]
 * encoding operates on the raw bytes of the JSON string, not individual
 * tuple elements, so mixed JS types within the tuple are fine.
 */
export function serializeSourceEntry(entry: SourceEntry): string {
    const tuple: (string | boolean)[] = [
        entry.hashFunctionId,
        entry.contentFormat,
        entry.contentHash,
        entry.rawFormat,
        entry.urlLink,
        entry.isChunked ?? false
    ];
    return JSON.stringify([tuple]); // Coll[Coll[Byte]] — array of one tuple
}

/**
 * Deserialize source entries from R9 content string.
 * 
 * Supports three formats (tried in order):
 * 1. Coll[Coll[Byte]] tuple format: [[hashFnId, contentFmt, contentHash, rawFmt, urlLink, isChunked]]
 * 2. Legacy JSON object format: [{ hashFunctionId, contentFormat, ... }]
 * 3. Legacy plain URL string
 * 
 * Note: tuple[5] (isChunked) is a boolean while other elements are strings.
 * This is fine because the JSON string is what gets encoded as Coll[Byte],
 * and JSON.parse restores the original types.
 */
export function deserializeSourceEntry(content: string): SourceEntry {
    const empty: SourceEntry = {
        hashFunctionId: '',
        contentFormat: '',
        contentHash: '',
        rawFormat: '',
        urlLink: ''
    };

    if (!content || content.trim() === '') return empty;

    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const tuple = parsed[0];

            // Format 1: Coll[Coll[Byte]] tuple array
            // [[hashFnId, contentFmt, contentHash, rawFmt, urlLink, isChunked?]]
            if (Array.isArray(tuple) && tuple.length >= 5) {
                return {
                    hashFunctionId: tuple[0] || '',
                    contentFormat: tuple[1] || '',
                    contentHash: tuple[2] || '',
                    rawFormat: tuple[3] || '',
                    urlLink: tuple[4] || '',
                    isChunked: tuple[5] === true
                };
            }

            // Format 2: Legacy JSON object format
            // [{ hashFunctionId, contentFormat, contentHash, rawFormat, urlLink, isChunked }]
            if (typeof tuple === 'object' && tuple !== null && !Array.isArray(tuple)) {
                return {
                    hashFunctionId: tuple.hashFunctionId || '',
                    contentFormat: tuple.contentFormat || tuple.contentFormatNftId || '',
                    contentHash: tuple.contentHash || '',
                    rawFormat: tuple.rawFormat || tuple.rawFormatNftId || '',
                    urlLink: tuple.urlLink || '',
                    isChunked: tuple.isChunked === true
                };
            }
        }
    } catch {
        // Not JSON — treat as legacy plain URL string
    }

    // Format 3: Legacy plain URL string
    return {
        hashFunctionId: '',
        contentFormat: '',
        contentHash: '',
        rawFormat: '',
        urlLink: content,
        isChunked: false
    };
}

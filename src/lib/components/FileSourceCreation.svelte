<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { addFileSource } from "$lib/ergo/sourceStore";
    import { type SourceEntry } from "$lib/ergo/sourceObject";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Label } from "$lib/components/ui/label/index.js";
    import { Textarea } from "$lib/components/ui/textarea";
    import { AlertTriangle, Download, Upload, Loader2 } from "lucide-svelte";
    import { type ReputationProof } from "$lib/ergo/object";
    import { blake2b256 } from "@fleet-sdk/crypto";
    import { uint8ArrayToHex } from "$lib/ergo/utils";
    import { type Writable } from "svelte/store";

    // Props for island mode
    export let profile: ReputationProof | null = null;
    export let explorerUri: string;
    export let source_explorer_url: string;
    export let onSourceAdded: ((txId: string) => void) | null = null;
    export let hash: Writable<string> | undefined = undefined;

    export let title: string = "Add New File Source";
    let className: string = "";
    export { className as class };

    const hasProfile = profile !== null;
    const baseClasses = "bg-card p-6 rounded-lg border";

    let newFileHash = "";
    let hashFunctionId = "";
    let isAddingSource = false;
    let addError: string | null = null;

    let isCalculatingHash = false;
    let hashError: string | null = null;
    let urlMismatch = false;

    // Single source entry form fields
    let entryHashFunctionId = "";
    let entryContentFormat = "";
    let entryContentHash = "";
    let entryRawFormat = "";
    let entryUrlLink = "";

    // Hash function dropdown
    const HASH_OPTIONS = [
        { label: "SHA3-256", value: "sha3_256" },
        { label: "Blake2b", value: "blake2b" },
        { label: "SHA-256", value: "sha256" },
        { label: "Keccak-256", value: "keccak256" },
        { label: "Custom", value: "__custom__" },
    ];
    let hashSelectValue = "";
    let customHashFunctionId = "";

    $: {
        if (hashSelectValue === "__custom__") {
            hashFunctionId = customHashFunctionId;
        } else {
            hashFunctionId = hashSelectValue;
        }
    }

    // Reactive value for the current hash from the store
    $: currentHashValue = (hash ? $hash : "") || "";
    $: isHashFixed = currentHashValue !== "";

    // Sync newFileHash with store
    $: if (hash && $hash) {
        newFileHash = $hash;
    }

    // Check if the source entry has a URL
    $: hasValidEntry = entryUrlLink.trim() !== "";

    // Pre-fill form via URL parameters (Change 5)
    onMount(() => {
        const params = $page.url.searchParams;
        const pFileHash = params.get("fileHash");
        const pHashFunctionId = params.get("hashFunctionId");
        const pUrlLink = params.get("urlLink");
        const pContentFormat = params.get("contentFormat");
        const pContentHash = params.get("contentHash");
        const pRawFormat = params.get("rawFormat");

        if (pFileHash) {
            updateHash(pFileHash);
        }
        if (pHashFunctionId) {
            // Check if it matches a known option
            const knownOption = HASH_OPTIONS.find(o => o.value === pHashFunctionId);
            if (knownOption) {
                hashSelectValue = pHashFunctionId;
            } else {
                hashSelectValue = "__custom__";
                customHashFunctionId = pHashFunctionId;
            }
        }
        if (pUrlLink) entryUrlLink = pUrlLink;
        if (pContentFormat) entryContentFormat = pContentFormat;
        if (pContentHash) entryContentHash = pContentHash;
        if (pRawFormat) entryRawFormat = pRawFormat;
    });

    function updateHash(val: string) {
        newFileHash = val;
        if (hash) {
            hash.set(val);
        }
    }

    async function calculateHashFromUrl() {
        const url = entryUrlLink.trim();
        if (!url) return;

        isCalculatingHash = true;
        hashError = null;
        urlMismatch = false;
        try {
            const response = await fetch(url);
            if (!response.ok)
                throw new Error(`Failed to fetch file: ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const hashResult = uint8ArrayToHex(blake2b256(bytes));

            if (isHashFixed && hashResult !== currentHashValue) {
                urlMismatch = true;
                hashError = `Calculated hash (${hashResult}) does not match the expected hash (${currentHashValue})`;
            } else {
                updateHash(hashResult);
            }
        } catch (err: any) {
            console.error("Error calculating hash from URL:", err);
            hashError = err?.message || "Failed to calculate hash from URL";
        } finally {
            isCalculatingHash = false;
        }
    }

    async function handleFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        isCalculatingHash = true;
        hashError = null;
        try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const hashResult = blake2b256(bytes);
            updateHash(uint8ArrayToHex(hashResult));
        } catch (err: any) {
            console.error("Error calculating hash from file:", err);
            hashError = err?.message || "Failed to calculate hash from file";
        } finally {
            isCalculatingHash = false;
            input.value = ""; // Reset input
        }
    }

    async function handleAddSource() {
        if (!hasValidEntry || !profile) return;

        // If hash is fixed but not yet validated (or mismatch), we should validate it now
        if (isHashFixed && !urlMismatch && newFileHash !== currentHashValue) {
            newFileHash = currentHashValue;
        }

        // If it's fixed, we MUST validate the URL content before adding
        if (isHashFixed && entryUrlLink.trim()) {
            isCalculatingHash = true;
            hashError = null;
            try {
                const response = await fetch(entryUrlLink.trim());
                if (!response.ok)
                    throw new Error(
                        `Failed to fetch file: ${response.statusText}`,
                    );
                const buffer = await response.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const hashResult = uint8ArrayToHex(blake2b256(bytes));

                if (hashResult !== currentHashValue) {
                    urlMismatch = true;
                    hashError = `Calculated hash (${hashResult}) does not match the expected hash (${currentHashValue})`;
                    isCalculatingHash = false;
                    return;
                }
            } catch (err: any) {
                console.error("Error validating URL:", err);
                hashError = err?.message || "Failed to validate URL";
                isCalculatingHash = false;
                return;
            } finally {
                isCalculatingHash = false;
            }
        }

        if (!newFileHash.trim() || urlMismatch) return;

        isAddingSource = true;
        addError = null;
        try {
            // Build single SourceEntry from form
            const entry: SourceEntry = {
                hashFunctionId: entryHashFunctionId.trim(),
                contentFormat: entryContentFormat.trim(),
                contentHash: entryContentHash.trim(),
                rawFormat: entryRawFormat.trim(),
                urlLink: entryUrlLink.trim()
            };

            const tx = await addFileSource(
                newFileHash.trim(),
                hashFunctionId.trim(),
                entry,
                profile,
                explorerUri,
            );
            console.log("Source added, tx:", tx);
            if (!isHashFixed) {
                updateHash("");
            }
            hashFunctionId = "";
            hashSelectValue = "";
            customHashFunctionId = "";
            entryHashFunctionId = "";
            entryContentFormat = "";
            entryContentHash = "";
            entryRawFormat = "";
            entryUrlLink = "";

            if (onSourceAdded) {
                onSourceAdded(tx);
            }
        } catch (err: any) {
            console.error("Error adding source:", err);
            addError = err?.message || "Failed to add source";
        } finally {
            isAddingSource = false;
        }
    }
</script>

<div class="{baseClasses} {className}">
    <h3 class="text-xl font-semibold mb-1">{title}</h3>
    <div class="mb-4">
        {#if newFileHash}
            <div class="text-xs font-mono text-muted-foreground break-all">
                <span class="font-semibold text-primary/70">Hash:</span>
                <a
                    href={`${source_explorer_url}?search=${newFileHash}`}
                    target="_blank"
                    class="hover:underline text-primary"
                >
                    {newFileHash}
                </a>
            </div>
        {:else}
            <div class="text-xs text-muted-foreground italic">
                No hash selected
            </div>
        {/if}
    </div>

    <div
        class="bg-amber-500/10 border border-amber-600 dark:border-amber-500/20 p-3 rounded-lg mb-4 flex gap-2"
    >
        <AlertTriangle class="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div class="text-sm text-amber-800 dark:text-amber-200">
            <strong>Security Warning:</strong> Always verify URLs before downloading.
            Malicious actors may post harmful links. The URL you provide will be
            publicly visible and immutable on the blockchain.
        </div>
    </div>

    {#if addError || hashError}
        <div class="bg-red-500/10 border border-red-600 dark:border-red-500/20 p-3 rounded-lg mb-4">
            <p class="text-sm text-red-800 dark:text-red-200 break-all">
                {addError || hashError}
            </p>
        </div>
    {/if}

    <div class="space-y-4">
        {#if !isHashFixed}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <Label for="file-hash">Raw File Hash (R5 Anchor)</Label>
                    <Input
                        type="text"
                        id="file-hash"
                        value={newFileHash}
                        on:input={(e) => updateHash(e.currentTarget.value)}
                        placeholder="64-character hexadecimal hash"
                        class="font-mono text-sm"
                        disabled={!hasProfile || isCalculatingHash}
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                        The raw file hash digest. Users search by this.
                    </p>
                </div>

                <div>
                    <Label>Upload File to Hash</Label>
                    <div class="relative">
                        <input
                            type="file"
                            id="file-upload"
                            class="hidden"
                            on:change={handleFileUpload}
                            disabled={!hasProfile || isCalculatingHash}
                        />
                        <Button
                            variant="outline"
                            class="w-full"
                            on:click={() =>
                                document.getElementById("file-upload")?.click()}
                            disabled={!hasProfile || isCalculatingHash}
                        >
                            {#if isCalculatingHash}
                                <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                                Calculating...
                            {:else}
                                <Upload class="w-4 h-4 mr-2" />
                                Select File
                            {/if}
                        </Button>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                        Calculate hash from a local file.
                    </p>
                </div>
            </div>
        {/if}

        <div>
            <Label for="hash-function-id">Hash Function ID</Label>
            <select
                id="hash-function-id"
                bind:value={hashSelectValue}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                disabled={!hasProfile || isCalculatingHash}
            >
                <option value="">Select hash function...</option>
                {#each HASH_OPTIONS as opt}
                    <option value={opt.value}>{opt.label}{opt.value !== "__custom__" ? ` (${opt.value})` : ""}</option>
                {/each}
            </select>
            {#if hashSelectValue === "__custom__"}
                <Input
                    type="text"
                    bind:value={customHashFunctionId}
                    placeholder="Enter custom hash function identifier"
                    class="font-mono text-sm mt-2"
                    disabled={!hasProfile || isCalculatingHash}
                />
            {/if}
            <p class="text-xs text-muted-foreground mt-1">
                Identifies the hash algorithm used. Per convention: output of HASH(EMPTY_INPUT).
            </p>
        </div>

        <!-- Source Entry -->
        <div class="space-y-4">
            <Label class="text-base font-semibold">Source Entry</Label>

            <div class="border rounded-lg p-4 space-y-3 bg-background/50">
                <div>
                    <Label for="url-link">URL / Download Link</Label>
                    <div class="flex gap-2">
                        <Textarea
                            id="url-link"
                            bind:value={entryUrlLink}
                            placeholder="https://example.com/file.zip or ipfs://... or magnet:..."
                            rows={2}
                            class="font-mono text-sm"
                            disabled={!hasProfile || isCalculatingHash}
                        />
                        {#if !isHashFixed}
                            <Button
                                variant="outline"
                                size="icon"
                                class="flex-shrink-0 h-auto"
                                on:click={calculateHashFromUrl}
                                disabled={!hasProfile ||
                                    isCalculatingHash ||
                                    !entryUrlLink.trim()}
                                title="Calculate hash from URL"
                            >
                                {#if isCalculatingHash}
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                {:else}
                                    <Download class="w-4 h-4" />
                                {/if}
                            </Button>
                        {/if}
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <Label for="entry-hash-fn">Hash Function ID</Label>
                        <Input
                            type="text"
                            id="entry-hash-fn"
                            bind:value={entryHashFunctionId}
                            placeholder="Hash function identifier"
                            class="font-mono text-xs"
                            disabled={!hasProfile}
                        />
                    </div>
                    <div>
                        <Label for="content-hash">Content Hash</Label>
                        <Input
                            type="text"
                            id="content-hash"
                            bind:value={entryContentHash}
                            placeholder="Hash of content at this URL"
                            class="font-mono text-xs"
                            disabled={!hasProfile}
                        />
                    </div>
                    <div>
                        <Label for="content-format">Content Format</Label>
                        <Input
                            type="text"
                            id="content-format"
                            bind:value={entryContentFormat}
                            placeholder=".tar.gz"
                            class="font-mono text-xs"
                            disabled={!hasProfile}
                        />
                    </div>
                    <div>
                        <Label for="raw-format">Raw Format</Label>
                        <Input
                            type="text"
                            id="raw-format"
                            bind:value={entryRawFormat}
                            placeholder=".bin"
                            class="font-mono text-xs"
                            disabled={!hasProfile}
                        />
                    </div>
                </div>
            </div>
        </div>

        <Button
            on:click={handleAddSource}
            disabled={isAddingSource ||
                isCalculatingHash ||
                !hasProfile ||
                !newFileHash.trim() ||
                !hasValidEntry}
            class="w-full"
        >
            {#if isAddingSource}
                <Loader2 class="w-4 h-4 mr-2 animate-spin inline" />
                Adding Source...
            {:else if isCalculatingHash}
                <Loader2 class="w-4 h-4 mr-2 animate-spin inline" />
                Validating URL...
            {:else}
                Add Source
            {/if}
        </Button>
    </div>
</div>

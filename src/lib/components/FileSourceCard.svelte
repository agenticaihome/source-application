<script lang="ts">
    import {
        type FileSource,
        type InvalidFileSource,
        type UnavailableSource,
        type SourceEntry,
        getPrimaryUrl,
    } from "$lib/ergo/sourceObject";
    import {
        confirmSource,
        markInvalidSource,
        markUnavailableSource,
        updateFileSource,
    } from "$lib/ergo/sourceStore";
    import { type ReputationProof } from "$lib/ergo/object";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import {
        ThumbsUp,
        ThumbsDown,
        Copy,
        ExternalLink,
        Check,
        X,
        Pen,
        CloudOff,
    } from "lucide-svelte";
    import * as jdenticon from "jdenticon";

    export let source: FileSource;
    export let confirmations: FileSource[] = [];
    export let invalidations: InvalidFileSource[] = [];
    export let unavailabilities: UnavailableSource[] = [];

    // New props to replace stores
    export let profile: ReputationProof | null = null;
    export let explorerUri: string;
    export let source_explorer_url: string;
    export let webExplorerUriTx: string;
    export let webExplorerUriTkn: string;

    // Derived from profile
    $: userProfileTokenId = profile?.token_id || null;

    let isVoting = false;
    let voteError: string | null = null;

    $: confirmationScore = confirmations.reduce(
        (sum, op) => sum + op.reputationAmount,
        0,
    );
    $: invalidationScore = invalidations.reduce(
        (sum, op) => sum + op.reputationAmount,
        0,
    );
    $: unavailabilityScore = unavailabilities.reduce(
        (sum, op) => sum + op.reputationAmount,
        0,
    );

    $: userHasConfirmed =
        source.ownerTokenId === userProfileTokenId ||
        confirmations.some((op) => op.ownerTokenId === userProfileTokenId);
    $: userHasInvalidated = invalidations.some(
        (op) => op.authorTokenId === userProfileTokenId,
    );
    $: userHasMarkedUnavailable = unavailabilities.some(
        (op) => op.authorTokenId === userProfileTokenId,
    );

    $: primaryUrl = getPrimaryUrl(source);
    $: sourceEntry = source.source;

    let isEditingSource = false;
    let editUrlLink = source.source?.urlLink || '';
    let isUpdatingSource = false;

    function getAvatarSvg(tokenId: string, size = 40): string {
        return jdenticon.toSvg(tokenId, size);
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

    function truncateId(id: string, chars: number = 8): string {
        if (id.length <= chars * 2 + 3) return id;
        return `${id.slice(0, chars)}...${id.slice(-chars)}`;
    }

    async function handleConfirm() {
        if (!profile) return;
        isVoting = true;
        voteError = null;
        try {
            await confirmSource(
                source.fileHash,
                source.hashFunctionId,
                source.source,
                profile,
                confirmations,
                explorerUri,
            );
            console.log("Source confirmed");
        } catch (err: any) {
            console.error("Error confirming:", err);
            voteError = err?.message || "Failed to confirm";
        } finally {
            isVoting = false;
        }
    }

    async function handleInvalid() {
        if (!profile) return;
        isVoting = true;
        voteError = null;
        try {
            await markInvalidSource(source.id, profile, explorerUri);
            console.log("Source marked as invalid");
        } catch (err: any) {
            console.error("Error marking invalid:", err);
            voteError = err?.message || "Failed to mark invalid";
        } finally {
            isVoting = false;
        }
    }

    async function handleUnavailable() {
        if (!profile) return;
        isVoting = true;
        voteError = null;
        try {
            await markUnavailableSource(primaryUrl, profile, explorerUri);
            console.log("Source marked as unavailable");
        } catch (err: any) {
            console.error("Error marking unavailable:", err);
            voteError = err?.message || "Failed to mark unavailable";
        } finally {
            isVoting = false;
        }
    }

    async function handleUpdateSource() {
        if (!profile || !editUrlLink.trim()) return;

        isUpdatingSource = true;
        voteError = null;
        try {
            const updatedEntry: SourceEntry = {
                ...source.source,
                urlLink: editUrlLink.trim(),
            };
            await updateFileSource(
                source.id,
                source.fileHash,
                updatedEntry,
                profile,
                explorerUri,
            );
            console.log("Source updated");
            isEditingSource = false;
        } catch (err: any) {
            console.error("Error updating source:", err);
            voteError = err?.message || "Failed to update source";
        } finally {
            isUpdatingSource = false;
        }
    }

    function getScoreColor(score: number): string {
        if (score > 0) return "text-green-500";
        if (score < 0) return "text-red-500";
        return "text-muted-foreground";
    }

    function getStatusBadge(): { text: string; color: string } {
        if (invalidationScore > confirmationScore) {
            return { text: "Invalid", color: "bg-red-500/20 text-red-400" };
        }
        if (unavailabilityScore > 0) {
            return {
                text: "Unavailable",
                color: "bg-orange-500/20 text-orange-400",
            };
        }
        if (confirmationScore > 0) {
            return {
                text: "Confirmed",
                color: "bg-green-500/20 text-green-400",
            };
        }
        return { text: "Unverified", color: "bg-gray-500/20 text-gray-400" };
    }

    $: statusBadge = getStatusBadge();
</script>

<div
    class="bg-card p-4 rounded-lg border hover:border-primary/50 transition-colors"
>
    <div class="flex items-start gap-4">
        <!-- Owner Avatar -->
        <a
            href={`${source_explorer_url}?profile=${source.ownerTokenId}`}
            target="_blank"
            class="flex-shrink-0 hover:opacity-80 transition-opacity"
            title="View profile sources"
        >
            {@html getAvatarSvg(source.ownerTokenId, 48)}
        </a>

        <!-- Main Content -->
        <div class="flex-1 min-w-0">
            <!-- Header: Owner + Status -->
            <div class="flex items-center gap-2 mb-2 flex-wrap">
                <a
                    href={`${source_explorer_url}?profile=${source.ownerTokenId}`}
                    target="_blank"
                    class="text-sm font-medium text-primary hover:underline"
                    title="View profile sources"
                >
                    @{source.ownerTokenId.slice(0, 8)}...
                </a>
                <a
                    href={`${webExplorerUriTkn}${source.ownerTokenId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-muted-foreground hover:text-primary"
                    title="View on Explorer"
                >
                    <ExternalLink class="w-3 h-3" />
                </a>
                <span class="text-xs px-2 py-0.5 rounded {statusBadge.color}">
                    {statusBadge.text}
                </span>
                <span class="text-xs text-muted-foreground">
                    {new Date(source.timestamp).toLocaleString()}
                </span>
            </div>

            <!-- File Hash -->
            <div class="mb-3">
                <div class="text-xs text-muted-foreground mb-1">Raw File Hash:</div>
                <div class="flex items-center gap-2">
                    <a
                        href={`${source_explorer_url}?search=${source.fileHash}`}
                        target="_blank"
                        class="text-sm bg-secondary px-2 py-1 rounded font-mono break-all hover:bg-secondary/80 text-left text-foreground"
                        title="Search for this hash"
                    >
                        {source.fileHash}
                    </a>
                    <button
                        on:click={() => copyToClipboard(source.fileHash)}
                        class="p-1 hover:bg-secondary rounded"
                        title="Copy hash"
                    >
                        <Copy class="w-3 h-3" />
                    </button>
                </div>
            </div>

            <!-- Hash Function ID -->
            {#if source.hashFunctionId}
                <div class="mb-3">
                    <div class="text-xs text-muted-foreground mb-1">Hash Function:</div>
                    <div class="text-xs font-mono bg-secondary/50 px-2 py-1 rounded break-all">
                        {truncateId(source.hashFunctionId, 12)}
                    </div>
                </div>
            {/if}

            <!-- Source Entry -->
            <div class="mb-3">
                <div class="text-xs text-muted-foreground mb-1">
                    Download Source:
                </div>

                {#if isEditingSource}
                    <div class="space-y-2">
                        <div class="flex gap-2">
                            <Input
                                bind:value={editUrlLink}
                                placeholder="Source URL"
                                class="h-8 text-sm font-mono"
                                disabled={isUpdatingSource}
                            />
                        </div>
                        <div class="flex gap-2 mt-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                class="h-8 px-3 text-green-500"
                                on:click={handleUpdateSource}
                                disabled={isUpdatingSource || !editUrlLink.trim()}
                            >
                                <Check class="w-4 h-4 mr-1" />
                                Save
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                class="h-8 px-3 text-red-500"
                                on:click={() => {
                                    isEditingSource = false;
                                    editUrlLink = source.source?.urlLink || '';
                                }}
                                disabled={isUpdatingSource}
                            >
                                <X class="w-4 h-4 mr-1" />
                                Cancel
                            </Button>
                        </div>
                    </div>
                {:else if sourceEntry}
                    <div class="flex items-center gap-2">
                        <a
                            href={sourceEntry.urlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-sm text-blue-400 hover:underline break-all font-mono flex items-center gap-1"
                        >
                            {sourceEntry.urlLink}
                            <ExternalLink class="w-3 h-3 flex-shrink-0" />
                        </a>
                        {#if source.ownerTokenId === userProfileTokenId}
                            <button
                                on:click={() => (isEditingSource = true)}
                                class="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
                                title="Edit source entry"
                            >
                                <Pen class="w-3 h-3" />
                            </button>
                        {/if}
                    </div>

                    <!-- Entry metadata (content hash, format) -->
                    {#if sourceEntry.contentHash || sourceEntry.contentFormat || sourceEntry.rawFormat}
                        <div class="mt-1 flex flex-wrap gap-2 text-xs">
                            {#if sourceEntry.contentHash}
                                <span class="bg-secondary/50 px-1.5 py-0.5 rounded font-mono" title="Content Hash">
                                    🔒 {truncateId(sourceEntry.contentHash, 6)}
                                </span>
                            {/if}
                            {#if sourceEntry.contentFormat}
                                <span class="bg-secondary/50 px-1.5 py-0.5 rounded font-mono" title="Content Format">
                                    📄 {sourceEntry.contentFormat}
                                </span>
                            {/if}
                            {#if sourceEntry.rawFormat}
                                <span class="bg-secondary/50 px-1.5 py-0.5 rounded font-mono" title="Raw Format">
                                    📦 {sourceEntry.rawFormat}
                                </span>
                            {/if}
                        </div>
                    {/if}
                {/if}
            </div>

            <!-- Voting Section -->
            <div class="flex items-center gap-4 flex-wrap">
                <!-- Vote Buttons -->
                {#if userProfileTokenId}
                    <div class="flex gap-2 items-center">
                        <Button
                            variant={userHasConfirmed ? "default" : "outline"}
                            size="sm"
                            on:click={handleConfirm}
                            disabled={isVoting || userHasConfirmed}
                            class="text-xs h-8"
                            title="Confirm this source provides the file"
                        >
                            <ThumbsUp class="w-3 h-3 mr-1" />
                            {userHasConfirmed ? "Confirmed" : "Confirm"}
                        </Button>
                        <Button
                            variant={userHasInvalidated ? "default" : "outline"}
                            size="sm"
                            on:click={handleInvalid}
                            disabled={isVoting || userHasInvalidated}
                            class="text-xs h-8"
                            title="Mark this source as fake or incorrect"
                        >
                            <ThumbsDown class="w-3 h-3 mr-1" />
                            {userHasInvalidated ? "Invalidated" : "Invalid"}
                        </Button>
                        <Button
                            variant={userHasMarkedUnavailable
                                ? "default"
                                : "outline"}
                            size="sm"
                            on:click={handleUnavailable}
                            disabled={isVoting || userHasMarkedUnavailable}
                            class="text-xs h-8"
                            title="Mark this URL as broken or unavailable"
                        >
                            <CloudOff class="w-3 h-3 mr-1" />
                            {userHasMarkedUnavailable
                                ? "Unavailable"
                                : "Unavailable"}
                        </Button>
                    </div>
                {/if}

                <!-- Score Display -->
                <div class="flex items-center gap-3 text-xs">
                    <div
                        class="flex items-center gap-1"
                        title="File Confirmations (Global)"
                    >
                        <ThumbsUp class="w-3 h-3 text-green-500" />
                        <span>{confirmations.length || 1}</span>
                    </div>
                    <div
                        class="flex items-center gap-1"
                        title="Source Invalidations (Thumbs Down)"
                    >
                        <ThumbsDown class="w-3 h-3 text-red-500" />
                        <span>{invalidations.length}</span>
                    </div>
                    <div
                        class="flex items-center gap-1"
                        title="Source Offline (Unavailable)"
                    >
                        <CloudOff class="w-3 h-3 text-orange-500" />
                        <span>{unavailabilities.length}</span>
                    </div>
                </div>

                <!-- Transaction Link -->
                <a
                    href={`${webExplorerUriTx}${source.transactionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs text-muted-foreground hover:text-foreground ml-auto"
                >
                    #{source.id.slice(0, 8)}...
                </a>
            </div>

            <!-- Vote Error -->
            {#if voteError}
                <div class="mt-2 text-xs text-red-400">
                    {voteError}
                </div>
            {/if}
        </div>
    </div>
</div>

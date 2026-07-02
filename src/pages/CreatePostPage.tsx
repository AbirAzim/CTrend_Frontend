import { useMutation, useQuery } from "@apollo/client";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CATEGORIES, CREATE_POST, FEED_POSTS } from "../graphql/feed";
import { CREATE_SYSTEM_POST, PLATFORM_SETTINGS } from "../graphql/admin";
import { PUBLIC_CAMPAIGNS, CAMPAIGNS_ADMIN } from "../graphql/campaigns";
import { CAMPAIGN_BADGE_ICON } from "@ctrend/shared/lib/campaignUi";
import { DateTimePicker } from "../components/DateTimePicker";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useImageUpload } from "../lib/useImageUpload";
import { COIN_AMOUNTS, dispatchCoinEarned } from "../lib/coins";
import { useAuth } from "../context/AuthContext";
import { IconGlobe, IconUsers, IconCompare, IconPoll, IconImages } from "../components/IgIcons";
import { ImagePositionEditor } from "../components/ImagePositionEditor";
import { CompareImageCropper } from "../components/CompareImageCropper";
import { DEFAULT_IMAGE_FOCAL, hasCustomFocal, imageObjectPosition } from "../lib/imageFocal";
import { FeedPostCard } from "../components/FeedPostCard";
import type { FeedPostView, CompareLayout } from "../types/feed";
import {
  compareCellAspectRatio,
  compareCropAspect,
  toGqlCompareLayout,
} from "@ctrend/shared/lib/compareLayout";

type DraftCompareItem = {
  id: string;
  imageUrl: string;
  title: string;
  imageFocalX: number;
  imageFocalY: number;
  localPreview?: string;
  imageSource?: "upload" | "url";
};

type CategoriesQueryData = {
  categories: Array<{ id: string; name?: string | null }>;
};

function localInputToUtcIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // Parse datetime-local deterministically (avoid browser-dependent parsing).
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!m) {
    return null;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? "0");
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // RFC3339 (UTC offset form), e.g. `2026-04-15T12:30:00+00:00`
  // This format is accepted by stricter ISO validators as well.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+00:00`;
}

export function CreatePostPage() {
  const navigate = useNavigate();
  const { uploadImage } = useImageUpload();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastItemRef = useRef<HTMLDivElement | null>(null);

  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [votingEndsAt, setVotingEndsAt] = useState("");
  const [votingEndEnabled, setVotingEndEnabled] = useState(false);
  const [postType, setPostType] = useState<"regular" | "system">("regular");
  const [items, setItems] = useState<DraftCompareItem[]>([
    { id: "1", imageUrl: "", title: "", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
    { id: "2", imageUrl: "", title: "", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
  ]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [positionEditId, setPositionEditId] = useState<string | null>(null);
  // Pending crop: compare images pass through the crop+zoom editor before upload.
  const [cropper, setCropper] = useState<{ id: string; url: string } | null>(null);
  const [sourcePicker, setSourcePicker] = useState<string | null>(null);
  const [urlEditId, setUrlEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [broadcastGlobally, setBroadcastGlobally] = useState(false);
  /** Post layout: `compare` (image grid), `poll` (stacked option rows), or `announcement` (admin info post). */
  const [format, setFormat] = useState<"compare" | "poll" | "announcement">("compare");
  const [compareLayout, setCompareLayout] = useState<CompareLayout>("horizontal");
  const isPoll = format === "poll";
  const isAnnouncement = format === "announcement";
  /** Poll-only body/context images (post-level `imageUrls`). Optional, 0+. */
  const [bodyImages, setBodyImages] = useState<
    Array<{ id: string; imageUrl: string; localPreview?: string }>
  >([]);
  const [bodyUploadingId, setBodyUploadingId] = useState<string | null>(null);
  const bodyFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: platformSettingsData } = useQuery(PLATFORM_SETTINGS);
  const allowUserGlobalPosts = Boolean(
    platformSettingsData?.platformSettings?.allowUserGlobalPosts,
  );
  const showGlobalPostOption = !isAdmin && allowUserGlobalPosts;

  function handleFileChange(id: string, file: File | undefined) {
    if (!file) return;
    setSourcePicker(null);
    setUrlEditId(null);
    if (!isPoll && !isAnnouncement) {
      // Compare images go through the crop+zoom editor for a uniform shape.
      setCropper({ id, url: URL.createObjectURL(file) });
      return;
    }
    // Poll/announcement images upload directly.
    void uploadFileToItem(id, file);
  }

  async function uploadFileToItem(id: string, file: File) {
    // Show local preview immediately so user sees feedback before upload finishes
    const localPreview = URL.createObjectURL(file);
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, localPreview, imageSource: "upload", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL }
          : it,
      ),
    );
    setUploadingId(id);
    setError(null);
    try {
      const publicUrl = await uploadImage(file);
      // Replace local preview with the permanent R2 URL
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, imageUrl: publicUrl, localPreview: undefined } : it,
        ),
      );
      URL.revokeObjectURL(localPreview);
    } catch (err: unknown) {
      // Clear local preview — image didn't actually land in R2
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, localPreview: undefined } : it,
        ),
      );
      URL.revokeObjectURL(localPreview);
      setError(err instanceof Error ? err.message : "Upload failed — please try again.");
    } finally {
      setUploadingId(null);
    }
  }

  /** Poll quick-fill: two text options "Yes"/"No", no images. */
  function fillYesNo() {
    setItems([
      { id: "yes", imageUrl: "", title: "Yes", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
      { id: "no", imageUrl: "", title: "No", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
    ]);
  }

  function addBodyImage() {
    setBodyImages((prev) => [...prev, { id: String(Date.now()), imageUrl: "" }]);
  }

  function removeBodyImage(id: string) {
    setBodyImages((prev) => prev.filter((b) => b.id !== id));
  }

  async function handleBodyFileChange(id: string, file: File | undefined) {
    if (!file) return;
    const localPreview = URL.createObjectURL(file);
    setBodyImages((prev) =>
      prev.map((b) => (b.id === id ? { ...b, localPreview } : b)),
    );
    setBodyUploadingId(id);
    setError(null);
    try {
      const publicUrl = await uploadImage(file);
      setBodyImages((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, imageUrl: publicUrl, localPreview: undefined } : b,
        ),
      );
      URL.revokeObjectURL(localPreview);
    } catch (err: unknown) {
      setBodyImages((prev) =>
        prev.map((b) => (b.id === id ? { ...b, localPreview: undefined } : b)),
      );
      URL.revokeObjectURL(localPreview);
      setError(err instanceof Error ? err.message : "Upload failed — please try again.");
    } finally {
      setBodyUploadingId(null);
    }
  }

  const [createPost, { loading: creatingPost }] = useMutation(CREATE_POST);
  const [createSystemPost, { loading: creatingSystemPost }] = useMutation(CREATE_SYSTEM_POST);
  const loading = creatingPost || creatingSystemPost;
  const {
    data: categoriesData,
    loading: categoriesLoading,
    error: categoriesError,
  } =
    useQuery<CategoriesQueryData>(CATEGORIES, {
      fetchPolicy: "cache-first",
      errorPolicy: "all",
    });

  // Normal users only see campaigns admins have enabled for users (isPublic);
  // admins see every campaign.
  const { data: publicCampaignsData } = useQuery<{ publicCampaigns: Array<{ id: string; name: string; slug: string; isActive?: boolean; isDefault?: boolean | null }> }>(
    PUBLIC_CAMPAIGNS,
    { skip: isAdmin, fetchPolicy: "cache-first", errorPolicy: "all" },
  );
  const { data: adminCampaignsData } = useQuery<{ campaigns: Array<{ id: string; name: string; slug: string; isActive: boolean; isDefault?: boolean | null }> }>(
    CAMPAIGNS_ADMIN,
    { skip: !isAdmin, fetchPolicy: "cache-first", errorPolicy: "all" },
  );

  const campaignOptions = useMemo(() => {
    const raw = isAdmin
      ? (adminCampaignsData?.campaigns ?? [])
      : (publicCampaignsData?.publicCampaigns ?? []);
    return [...raw].sort((a, b) => {
      if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
      if (isAdmin && !!a.isActive !== !!b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [isAdmin, adminCampaignsData?.campaigns, publicCampaignsData?.publicCampaigns]);

  const [showPreview, setShowPreview] = useState(false);

  const previewCategory = useMemo(() => {
    if (!categoryId) return null;
    const cat = (categoriesData?.categories ?? []).find((c) => c.id === categoryId);
    return cat ? { id: cat.id, name: cat.name ?? "", slug: null, color: null } : null;
  }, [categoryId, categoriesData]);

  const previewCampaign = useMemo(() => {
    if (!campaignId) return null;
    const c = campaignOptions.find((c) => c.id === campaignId);
    return c ? { id: c.id, name: c.name, slug: "", prizePerWinner: 0, hasRewards: null, hasWinner: null } : null;
  }, [campaignId, campaignOptions]);

  const previewPost = useMemo((): FeedPostView => {
    const compareImages = items
      .map((it) => it.imageUrl || it.localPreview || "")
      .filter((u) => u.length > 0);
    return {
      id: "preview",
      format,
      compareLayout: !isPoll && !isAnnouncement ? compareLayout : "horizontal",
      postType: isAdmin && postType === "system" ? "system" : "user",
      isUserGlobalBroadcast: broadcastGlobally || null,
      authorId: user?.id ?? "preview",
      authorUsername: user?.username ?? "you",
      authorDisplayName: user?.displayName ?? null,
      authorProfileImageUrl: user?.profileImageUrl ?? null,
      caption: caption.trim() || null,
      imageUrls: format === "compare" ? compareImages : bodyImages.map((b) => b.imageUrl).filter((u): u is string => Boolean(u)),
      postOptions: items.map((it) => ({
        label: it.title.trim() || "",
        imageUrl: it.imageUrl || it.localPreview || null,
        imageFocalX: it.imageFocalX,
        imageFocalY: it.imageFocalY,
      })),
      optionStats: [],
      upvoteCount: 0,
      downvoteCount: 0,
      viewerVote: null,
      mySelectedOptionIndex: null,
      isVotingOpen: isAnnouncement ? false : true,
      createdAt: new Date().toISOString(),
      votingEndsAt: votingEndEnabled && votingEndsAt ? localInputToUtcIso(votingEndsAt) : null,
      category: previewCategory,
      campaign: previewCampaign,
      commentCount: 0,
      hypeCount: 0,
      saveCount: 0,
    };
  }, [format, compareLayout, isAnnouncement, items, caption, user, isAdmin, postType, broadcastGlobally, bodyImages, previewCategory, previewCampaign, votingEndEnabled, votingEndsAt, isPoll]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const category = categoryId.trim();
    if (!category) {
      setError("Category ID is required.");
      return;
    }

    const now = Date.now();
    const hasVotingInput = votingEndsAt.trim().length > 0;
    const votingEndsAtIso = votingEndEnabled ? localInputToUtcIso(votingEndsAt) : null;

    if (votingEndEnabled) {
      if (!hasVotingInput || !votingEndsAtIso) {
        setError("Please choose a voting deadline (date + time).");
        return;
      }
      if (new Date(votingEndsAtIso).getTime() <= now) {
        setError("Deadline must be in the future.");
        return;
      }
    }

    let imageUrls: string[];
    let options: Array<{
      label: string;
      imageUrl?: string;
      imageFocalX?: number;
      imageFocalY?: number;
    }>;

    if (isAnnouncement) {
      // Announcement: no options, body images from bodyImages list.
      options = [];
      imageUrls = bodyImages.map((b) => b.imageUrl.trim()).filter((u) => u.length > 0);
    } else if (isPoll) {
      const labeledCount = items.filter((it) => it.title.trim().length > 0).length;
      if (labeledCount < 2) {
        setError("Please add at least two poll options with labels.");
        return;
      }
      // Poll options: label required, image optional (text-only rows allowed).
      options = items.map((it, idx) => {
        const label = it.title.trim() || `Option ${idx + 1}`;
        const img = it.imageUrl.trim();
        return img
          ? { label, imageUrl: img, imageFocalX: it.imageFocalX, imageFocalY: it.imageFocalY }
          : { label };
      });
      // Body/context images live in post-level imageUrls (optional for polls).
      imageUrls = bodyImages
        .map((b) => b.imageUrl.trim())
        .filter((u) => u.length > 0);
    } else {
      const normalized = items
        .map((it) => ({
          imageUrl: it.imageUrl.trim(),
          title: it.title.trim(),
        }))
        .filter((it) => it.imageUrl.length > 0);

      if (normalized.length < 2) {
        setError("Please upload images for at least two options.");
        return;
      }

      imageUrls = normalized.map((it) => it.imageUrl);
      options = items
        .filter((it) => it.imageUrl.trim().length > 0)
        .map((it, idx) => ({
          label: it.title.trim() || `Option ${idx + 1}`,
          imageUrl: it.imageUrl.trim(),
          imageFocalX: it.imageFocalX,
          imageFocalY: it.imageFocalY,
        }));
    }

    // Validate schedule time if enabled
    const scheduledAtIso = scheduleEnabled ? localInputToUtcIso(scheduledAt) : null;
    if (scheduleEnabled) {
      if (!scheduledAtIso) {
        setError("Please choose a valid schedule time.");
        return;
      }
      if (new Date(scheduledAtIso).getTime() <= Date.now()) {
        setError("Scheduled time must be in the future.");
        return;
      }
    }

    const input: {
      categoryId: string;
      format: "COMPARE" | "POLL" | "ANNOUNCEMENT";
      imageUrls: string[];
      options: Array<{ label: string; imageUrl?: string; imageFocalX?: number; imageFocalY?: number }>;
      votingEndsAt?: string;
      scheduledAt?: string;
      contentText?: string;
      caption?: string;
      campaignId?: string;
      broadcastGlobally?: boolean;
      compareLayout?: "HORIZONTAL" | "VERTICAL";
    } = {
      categoryId: category,
      format: format.toUpperCase() as "COMPARE" | "POLL" | "ANNOUNCEMENT",
      imageUrls,
      options,
    };
    const cap = caption.trim();
    if (cap) {
      input.contentText = cap;
      input.caption = cap;
    }
    if (votingEndsAtIso) {
      input.votingEndsAt = votingEndsAtIso;
    }
    if (scheduledAtIso) {
      input.scheduledAt = scheduledAtIso;
    }
    const pickedCampaign = campaignId.trim();
    if (pickedCampaign) {
      input.campaignId = pickedCampaign;
    }
    if (showGlobalPostOption && broadcastGlobally) {
      input.broadcastGlobally = true;
    }
    if (!isPoll && !isAnnouncement) {
      input.compareLayout = toGqlCompareLayout(compareLayout);
    }

    const useSystemMutate = isAdmin && (postType === "system" || isAnnouncement);
    try {
      const mutate = useSystemMutate ? createSystemPost : createPost;
      await mutate({
        variables: { input },
        // Don't refetch feed for scheduled posts — they won't appear there yet
        refetchQueries: scheduledAtIso ? [] : [{ query: FEED_POSTS }],
      });
      // Coins: earn for creating a post (system/admin posts aren't rewarded).
      if (!useSystemMutate) dispatchCoinEarned(COIN_AMOUNTS.POST);
      if (scheduledAtIso) {
        const formatted = new Date(scheduledAtIso).toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        });
        setSuccessToast(`Your post is scheduled for ${formatted}.`);
        // Reset form
        setCaption("");
        setCategoryId("");
        setVotingEndsAt("");
        setCampaignId("");
        setScheduledAt("");
        setScheduleEnabled(false);
        setCompareLayout("horizontal");
        setItems([
          { id: "1", imageUrl: "", title: "", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
          { id: "2", imageUrl: "", title: "", imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL },
        ]);
        setBodyImages([]);
        setTimeout(() => setSuccessToast(null), 5000);
        return;
      }
      navigate("/", { replace: true });
    } catch (err: unknown) {
      // Backend may reject `votingEndsAt` by strict DTO validation; retry once without it.
      if (input.votingEndsAt) {
        const retryInput = { ...input };
        delete retryInput.votingEndsAt;
        try {
          const mutate = useSystemMutate ? createSystemPost : createPost;
          await mutate({
            variables: { input: retryInput },
          });
          navigate("/", { replace: true });
          return;
        } catch (retryErr: unknown) {
          setError(getApolloErrorMessage(retryErr));
          return;
        }
      }
      setError(getApolloErrorMessage(err));
    }
  }

  function addItem() {
    const newId = String(Date.now());
    setItems((prev) => [
      ...prev,
      {
        id: newId,
        imageUrl: "",
        title: "",
        imageFocalX: DEFAULT_IMAGE_FOCAL,
        imageFocalY: DEFAULT_IMAGE_FOCAL,
      },
    ]);
    // Scroll new slot into view and immediately offer the source picker
    setTimeout(() => {
      lastItemRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setSourcePicker(newId);
    }, 120);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      if (prev.length <= 2) {
        return prev;
      }
      return prev.filter((it) => it.id !== id);
    });
  }

  function dismissUrlEdit(id: string) {
    setUrlEditId(null);
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (it.imageSource !== "url") return it;
        const trimmed = it.imageUrl.trim();
        if (trimmed.startsWith("http")) return it;
        return {
          ...it,
          imageUrl: "",
          localPreview: undefined,
          imageSource: undefined,
          imageFocalX: DEFAULT_IMAGE_FOCAL,
          imageFocalY: DEFAULT_IMAGE_FOCAL,
        };
      }),
    );
  }

  function updateItem(id: string, key: "imageUrl" | "title", value: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (key === "imageUrl" && value.trim() !== it.imageUrl.trim()) {
          return {
            ...it,
            imageUrl: value,
            imageSource: "url",
            imageFocalX: DEFAULT_IMAGE_FOCAL,
            imageFocalY: DEFAULT_IMAGE_FOCAL,
          };
        }
        return { ...it, [key]: value };
      }),
    );
  }

  const positionEditItem = positionEditId
    ? items.find((it) => it.id === positionEditId)
    : null;

  const LABELS = ["A", "B", "C", "D"];

  return (
    <div className="ig-create-page">
      <div className="ig-create-hero">
        <span className="ig-create-hero-chip">
          {isAnnouncement ? "New Announcement" : isPoll ? "New Poll" : "New Compare"}
        </span>
        <h1 className="ig-create-title">
          {isAnnouncement ? "Share an announcement" : "What's your take?"}
        </h1>
        <p className="ig-create-lead">
          {isAnnouncement
            ? "Post platform-wide info with images and links."
            : isPoll
            ? "Ask a question. Let the crowd pick a side."
            : "Drop your picks. Let the crowd decide."}
        </p>
      </div>

      <form className="ig-create-form" onSubmit={(ev) => void onSubmit(ev)}>

        {/* ── Format switcher ── */}
        <div className="ig-format-switch" role="tablist" aria-label="Post format">
          <button
            type="button"
            role="tab"
            aria-selected={format === "compare"}
            className={`ig-format-switch-btn${format === "compare" ? " ig-format-switch-btn--active" : ""}`}
            onClick={() => setFormat("compare")}
          >
            <IconCompare size={15} />
            Compare
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={format === "poll"}
            className={`ig-format-switch-btn${format === "poll" ? " ig-format-switch-btn--active" : ""}`}
            onClick={() => setFormat("poll")}
          >
            <IconPoll size={15} />
            Poll
          </button>
          {isAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={format === "announcement"}
              className={`ig-format-switch-btn${format === "announcement" ? " ig-format-switch-btn--active" : ""}`}
              onClick={() => setFormat("announcement")}
            >
              📢 Announcement
            </button>
          )}
        </div>

        {!isPoll && !isAnnouncement && (
          <>
            <div className="ig-compare-layout-switch" role="radiogroup" aria-label="Compare layout">
              <button
                type="button"
                role="radio"
                aria-checked={compareLayout === "horizontal"}
                className={`ig-compare-layout-btn${compareLayout === "horizontal" ? " ig-compare-layout-btn--active" : ""}`}
                onClick={() => setCompareLayout("horizontal")}
              >
                Side by side
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={compareLayout === "vertical"}
                className={`ig-compare-layout-btn${compareLayout === "vertical" ? " ig-compare-layout-btn--active" : ""}`}
                onClick={() => setCompareLayout("vertical")}
              >
                Stacked
              </button>
            </div>
            <p className="ig-compare-layout-hint muted small">
              {compareLayout === "vertical"
                ? "Stacked shows wide landscape strips (16:9) — crop each photo to fit."
                : "Side by side uses portrait frames (4:5) — crop each photo to fit."}
            </p>
          </>
        )}

        {/* ── Audience: Friends vs Global (only when admin allows global) ── */}
        {showGlobalPostOption && (
          <div className="ig-create-settings-card ig-audience-card">
            <p className="ig-settings-label">
              <span className="ig-settings-icon">👁</span> Who can see &amp; vote?
            </p>
            <div className="ig-audience-switch" role="radiogroup" aria-label="Post audience">
              <button
                type="button"
                role="radio"
                aria-checked={!broadcastGlobally}
                className={`ig-audience-option${!broadcastGlobally ? " ig-audience-option--active" : ""}`}
                onClick={() => setBroadcastGlobally(false)}
              >
                <span className="ig-audience-option-title"><IconUsers size={16} /> Friends</span>
                <span className="ig-audience-option-sub">Only your friends can view and vote</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={broadcastGlobally}
                className={`ig-audience-option${broadcastGlobally ? " ig-audience-option--active" : ""}`}
                onClick={() => setBroadcastGlobally(true)}
              >
                <span className="ig-audience-option-title"><IconGlobe size={16} /> Global</span>
                <span className="ig-audience-option-sub">Everyone on Ke Jitbe sees it &amp; can vote</span>
              </button>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="ig-create-settings-card ig-admin-post-type">
            <p className="ig-settings-label">
              <span className="ig-settings-icon">🛡</span> Post visibility
            </p>
            <div className="ig-admin-post-type-options">
              <label className={`ig-admin-post-type-option${postType === "regular" ? " ig-admin-post-type-option--active" : ""}`}>
                <input
                  type="radio"
                  name="postType"
                  value="regular"
                  checked={postType === "regular"}
                  onChange={() => setPostType("regular")}
                />
                <strong>Friends Only</strong>
                <span className="muted small">Visible to your followers only</span>
              </label>
              <label className={`ig-admin-post-type-option${postType === "system" ? " ig-admin-post-type-option--active" : ""}`}>
                <input
                  type="radio"
                  name="postType"
                  value="system"
                  checked={postType === "system"}
                  onChange={() => setPostType("system")}
                />
                <strong>Platform-wide Post</strong>
                <span className="muted small">Visible to ALL users · highest priority</span>
              </label>
            </div>
          </div>
        )}

        {isAnnouncement ? (
          <div className="ig-poll-body-edit">
            <span className="ig-settings-label">
              <span className="ig-settings-icon" aria-hidden><IconImages size={15} /></span> Images
              <span className="ig-settings-optional">optional · up to 6</span>
            </span>
            <div className="ig-poll-body-grid">
              {bodyImages.map((b) => (
                <div className="ig-poll-body-cell" key={b.id}>
                  <input
                    ref={(el) => { bodyFileRefs.current[b.id] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    style={{ display: "none" }}
                    onChange={(ev) => void handleBodyFileChange(b.id, ev.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className={`ig-poll-body-thumb${b.imageUrl || b.localPreview ? " ig-poll-body-thumb--filled" : ""}`}
                    style={b.imageUrl || b.localPreview ? { backgroundImage: `url(${b.imageUrl || b.localPreview})` } : undefined}
                    onClick={() => bodyFileRefs.current[b.id]?.click()}
                    disabled={bodyUploadingId === b.id}
                    aria-label="Upload image"
                  >
                    {bodyUploadingId === b.id ? (
                      <span className="ig-compare-spinner" />
                    ) : b.imageUrl || b.localPreview ? null : (
                      <span className="ig-poll-edit-thumb-plus" aria-hidden>＋</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="ig-poll-body-remove"
                    onClick={() => removeBodyImage(b.id)}
                    aria-label="Remove image"
                  >✕</button>
                </div>
              ))}
              {bodyImages.length < 6 && (
                <button type="button" className="ig-poll-body-add" onClick={addBodyImage}>
                  <span aria-hidden>＋</span>
                  <span>Add image</span>
                </button>
              )}
            </div>
          </div>
        ) : !isPoll ? (
        <>
        {/* ── Compare slots ── */}
        <div className="ig-create-vs-wrap">
          <div
            className={`ig-compare-grid${compareLayout === "vertical" && items.length < 3 ? " ig-compare-grid--vertical" : ""}`}
          >
            {items.map((item, idx) => (
              <div
                className="ig-compare-slot"
                key={item.id}
                ref={idx === items.length - 1 ? lastItemRef : null}
              >
                <input
                  ref={(el) => { fileInputRefs.current[item.id] = el; }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  style={{ display: "none" }}
                  onChange={(ev) =>
                    void handleFileChange(item.id, ev.target.files?.[0])
                  }
                />
                <input
                  ref={(el) => { cameraInputRefs.current[item.id] = el; }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(ev) =>
                    void handleFileChange(item.id, ev.target.files?.[0])
                  }
                />
                <div
                  className={`ig-compare-zone-wrap${item.imageUrl || item.localPreview ? " ig-compare-zone-wrap--filled" : ""}`}
                >
                  <button
                    type="button"
                    className={`ig-compare-zone${item.imageUrl || item.localPreview ? " ig-compare-zone--filled" : ""}`}
                    style={
                      item.imageUrl || item.localPreview
                        ? {
                            backgroundImage: `url(${item.imageUrl || item.localPreview})`,
                            backgroundPosition: imageObjectPosition(
                              item.imageFocalX,
                              item.imageFocalY,
                            ),
                          }
                        : undefined
                    }
                    onClick={() => setSourcePicker(item.id)}
                    disabled={uploadingId === item.id}
                    aria-label={`Upload image for option ${LABELS[idx] ?? idx + 1}`}
                  >
                    {uploadingId === item.id ? (
                      <span className="ig-compare-zone-uploading">
                        <span className="ig-compare-spinner" />
                        Uploading…
                      </span>
                    ) : item.imageUrl || item.localPreview ? null : (
                      <span className="ig-compare-zone-empty">
                        <span className="ig-compare-zone-icon">↑</span>
                        <span className="ig-compare-zone-label">Option {LABELS[idx] ?? idx + 1}</span>
                        <span className="ig-compare-zone-hint">Tap to add</span>
                      </span>
                    )}
                  </button>
                  {(item.imageUrl || item.localPreview) && uploadingId !== item.id ? (
                    <div className="ig-compare-zone-actions">
                      <button
                        type="button"
                        className="ig-compare-zone-action"
                        onClick={() => setPositionEditId(item.id)}
                      >
                        Position
                        {hasCustomFocal(item.imageFocalX, item.imageFocalY) ? " ·" : ""}
                      </button>
                      <button
                        type="button"
                        className="ig-compare-zone-action"
                        onClick={() => setSourcePicker(item.id)}
                      >
                        Change
                      </button>
                    </div>
                  ) : null}
                </div>

                {urlEditId === item.id && (
                  <div className="ig-compare-url-row">
                    <input
                      type="url"
                      className="ig-compare-url-input"
                      value={item.imageUrl}
                      onChange={(ev) => updateItem(item.id, "imageUrl", ev.target.value)}
                      placeholder="Paste image URL…"
                      autoComplete="off"
                      autoFocus
                      disabled={uploadingId === item.id}
                    />
                    <button
                      type="button"
                      className="ig-compare-url-dismiss"
                      onClick={() => dismissUrlEdit(item.id)}
                      aria-label="Remove paste URL"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <input
                  id={`create-item-title-${item.id}`}
                  name={`itemTitle-${idx}`}
                  type="text"
                  className="ig-compare-title-input"
                  value={item.title}
                  onChange={(ev) => updateItem(item.id, "title", ev.target.value)}
                  placeholder={`Label…`}
                  autoComplete="off"
                />

                {items.length > 2 && (
                  <button
                    type="button"
                    className="ig-compare-remove"
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove option"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {items.length === 2 && (
            <div className="ig-compare-vs-badge">VS</div>
          )}
        </div>

        <button type="button" className="ig-create-add-btn" onClick={addItem}>
          + Add option
        </button>
        </>
        ) : (
        <>
          {/* ── Poll option rows ── */}
          <div className="ig-poll-edit">
            <div className="ig-poll-edit-head">
              <span className="ig-settings-label">
                <span className="ig-settings-icon" aria-hidden><IconPoll size={15} /></span> Poll options
                <span className="ig-settings-required">required</span>
              </span>
              <button
                type="button"
                className="ig-poll-yesno-btn"
                onClick={fillYesNo}
              >
                Yes / No
              </button>
            </div>
            <div className="ig-poll-edit-list">
              {items.map((item, idx) => (
                <div className="ig-poll-edit-row" key={item.id}>
                  <input
                    ref={(el) => { fileInputRefs.current[item.id] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    style={{ display: "none" }}
                    onChange={(ev) =>
                      void handleFileChange(item.id, ev.target.files?.[0])
                    }
                  />
                  <button
                    type="button"
                    className={`ig-poll-edit-thumb${item.imageUrl || item.localPreview ? " ig-poll-edit-thumb--filled" : ""}`}
                    style={
                      item.imageUrl || item.localPreview
                        ? { backgroundImage: `url(${item.imageUrl || item.localPreview})` }
                        : undefined
                    }
                    onClick={() => fileInputRefs.current[item.id]?.click()}
                    disabled={uploadingId === item.id}
                    aria-label={`Optional image for option ${idx + 1}`}
                  >
                    {uploadingId === item.id ? (
                      <span className="ig-compare-spinner" />
                    ) : item.imageUrl || item.localPreview ? null : (
                      <span className="ig-poll-edit-thumb-plus" aria-hidden>＋</span>
                    )}
                  </button>
                  <input
                    type="text"
                    className="ig-poll-edit-label-input"
                    value={item.title}
                    onChange={(ev) => updateItem(item.id, "title", ev.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    autoComplete="off"
                  />
                  {items.length > 2 && (
                    <button
                      type="button"
                      className="ig-poll-edit-remove"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove option"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="ig-create-add-btn" onClick={addItem}>
              + Add option
            </button>
          </div>

          {/* ── Poll body / context images (optional) ── */}
          <div className="ig-poll-body-edit">
            <span className="ig-settings-label">
              <span className="ig-settings-icon" aria-hidden><IconImages size={15} /></span> Context images
              <span className="ig-settings-optional">optional</span>
            </span>
            <p className="muted small">Shown above your poll options.</p>
            <div className="ig-poll-body-grid">
              {bodyImages.map((b) => (
                <div className="ig-poll-body-cell" key={b.id}>
                  <input
                    ref={(el) => { bodyFileRefs.current[b.id] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    style={{ display: "none" }}
                    onChange={(ev) =>
                      void handleBodyFileChange(b.id, ev.target.files?.[0])
                    }
                  />
                  <button
                    type="button"
                    className={`ig-poll-body-thumb${b.imageUrl || b.localPreview ? " ig-poll-body-thumb--filled" : ""}`}
                    style={
                      b.imageUrl || b.localPreview
                        ? { backgroundImage: `url(${b.imageUrl || b.localPreview})` }
                        : undefined
                    }
                    onClick={() => bodyFileRefs.current[b.id]?.click()}
                    disabled={bodyUploadingId === b.id}
                    aria-label="Upload context image"
                  >
                    {bodyUploadingId === b.id ? (
                      <span className="ig-compare-spinner" />
                    ) : b.imageUrl || b.localPreview ? null : (
                      <span className="ig-poll-edit-thumb-plus" aria-hidden>＋</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="ig-poll-body-remove"
                    onClick={() => removeBodyImage(b.id)}
                    aria-label="Remove context image"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ig-poll-body-add"
                onClick={addBodyImage}
              >
                <span aria-hidden>＋</span>
                <span>Add image</span>
              </button>
            </div>
          </div>
        </>
        )}

        {/* ── Settings card ── */}
        <div className="ig-create-settings-card">
          <div className="ig-settings-row ig-settings-row--col">
            <label htmlFor="create-category-id" className="ig-settings-label">
              <span className="ig-settings-icon">◈</span> Category
              <span className="ig-settings-required">required</span>
            </label>
            <div className="ig-cat-select-wrap">
              <select
                id="create-category-id"
                name="categoryId"
                className="ig-cat-select"
                value={categoryId}
                onChange={(ev) => setCategoryId(ev.target.value)}
                disabled={categoriesLoading}
              >
                <option value="">
                  {categoriesLoading ? "Loading categories…" : "Pick a category"}
                </option>
                {(categoriesData?.categories ?? []).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {(cat.name?.trim() || cat.id).toString()}
                  </option>
                ))}
              </select>
              <span className="ig-cat-select-chevron" aria-hidden>▾</span>
            </div>
            {categoriesError && (
              <small className="ig-settings-error">Could not load categories.</small>
            )}
          </div>

          {campaignOptions.length > 0 ? (
            <div className="ig-settings-row ig-settings-row--col">
              <label htmlFor="create-campaign-id" className="ig-settings-label">
                <span className="ig-settings-icon">{CAMPAIGN_BADGE_ICON}</span> Campaign
                <span className="ig-settings-optional">optional</span>
              </label>
              <div className="ig-cat-select-wrap">
                <select
                  id="create-campaign-id"
                  name="campaignId"
                  className="ig-cat-select"
                  value={campaignId}
                  onChange={(ev) => setCampaignId(ev.target.value)}
                >
                  <option value="">No campaign</option>
                  {campaignOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isDefault ? " (default)" : ""}
                      {isAdmin && "isActive" in c && !c.isActive ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
                <span className="ig-cat-select-chevron" aria-hidden>▾</span>
              </div>
              <p className="muted small ig-create-campaign-hint">
                Link this compare to a promo — it will show a campaign badge on the feed.
              </p>
            </div>
          ) : null}

          <div className="ig-settings-divider" />

          <div className="ig-settings-row ig-settings-row--col">
            <label htmlFor="create-caption" className="ig-settings-label">
              <span className="ig-settings-icon">✎</span> Caption
              <span className="ig-settings-optional">optional</span>
            </label>
            <textarea
              id="create-caption"
              name="caption"
              rows={2}
              className="ig-settings-textarea"
              value={caption}
              onChange={(ev) => setCaption(ev.target.value)}
              placeholder={isAnnouncement ? "Write your announcement… (links become clickable)" : isPoll ? "Ask your question… (links become clickable)" : "What are you comparing?"}
              autoComplete="off"
            />
          </div>

          {!isAnnouncement && (
            <>
              <div className="ig-settings-divider" />
              <div className="ig-settings-row ig-settings-row--col">
                <label className="ig-voting-toggle">
                  <span className="ig-settings-label" style={{ minWidth: 0, flex: 1 }}>
                    <span className="ig-settings-icon">⏱</span> Set voting deadline
                    <span className="ig-settings-optional">optional</span>
                  </span>
                  <span className="ig-toggle-switch-wrap">
                    <input
                      type="checkbox"
                      checked={votingEndEnabled}
                      onChange={(e) => {
                        setVotingEndEnabled(e.target.checked);
                        if (!e.target.checked) setVotingEndsAt("");
                      }}
                    />
                    <span className="ig-toggle-switch" aria-hidden />
                  </span>
                </label>
                {votingEndEnabled && (
                  <DateTimePicker
                    value={votingEndsAt}
                    onChange={setVotingEndsAt}
                    minDate={new Date(Date.now() + 60_000).toISOString()}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Schedule date picker (shown when schedule mode active) ── */}
        {!isAnnouncement && scheduleEnabled && (
          <div className="ig-schedule-picker-wrap">
            <label className="ig-schedule-picker-label">
              ⏰ When should this go live?
            </label>
            <DateTimePicker
              value={scheduledAt}
              onChange={setScheduledAt}
              minDate={new Date(Date.now() + 60_000).toISOString()}
              label="Schedule date and time"
            />
            <button
              type="button"
              className="ig-schedule-cancel-link"
              onClick={() => { setScheduleEnabled(false); setScheduledAt(""); }}
            >
              Cancel scheduling
            </button>
          </div>
        )}

        {error ? (
          <div className="ig-feed-banner ig-feed-banner--error" role="alert">
            {error}
          </div>
        ) : null}

        {successToast ? (
          <div className="ig-schedule-toast" role="status">
            ✓ {successToast}
          </div>
        ) : null}

        {/* ── Action buttons ── */}
        {!isAnnouncement && scheduleEnabled ? (
          <button
            type="submit"
            className="ig-create-submit"
            disabled={loading || !!uploadingId || !!bodyUploadingId || !scheduledAt}
          >
            {loading ? "Scheduling…" : "Confirm schedule →"}
          </button>
        ) : (
          <div className="ig-create-actions">
            <button
              type="submit"
              className="ig-create-submit ig-create-submit--main"
              disabled={loading || !!uploadingId || !!bodyUploadingId}
            >
              {loading ? "Posting…" : isAnnouncement ? "Post announcement →" : "Launch it →"}
            </button>
            {!isAnnouncement && (
              <button
                type="button"
                className="ig-create-submit ig-create-submit--schedule"
                disabled={loading || !!uploadingId || !!bodyUploadingId}
                onClick={() => setScheduleEnabled(true)}
              >
                ⏰ Schedule
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="ig-create-preview-btn"
          onClick={() => setShowPreview(true)}
        >
          👁 Preview
        </button>

        <p className="ig-create-cancel">
          <Link to="/">Cancel</Link>
        </p>
      </form>

      {positionEditItem && (positionEditItem.imageUrl || positionEditItem.localPreview) ? (
        <ImagePositionEditor
          src={positionEditItem.imageUrl || positionEditItem.localPreview!}
          label={`Option ${LABELS[items.findIndex((it) => it.id === positionEditItem.id)] ?? ""}`}
          aspectRatio={compareCellAspectRatio(compareLayout, items.length)}
          focalX={positionEditItem.imageFocalX}
          focalY={positionEditItem.imageFocalY}
          onChange={(imageFocalX, imageFocalY) => {
            setItems((prev) =>
              prev.map((it) =>
                it.id === positionEditItem.id ? { ...it, imageFocalX, imageFocalY } : it,
              ),
            );
          }}
          onClose={() => setPositionEditId(null)}
        />
      ) : null}

      {cropper ? (
        <CompareImageCropper
          src={cropper.url}
          aspect={compareCropAspect(compareLayout, items.length)}
          onCancel={() => {
            URL.revokeObjectURL(cropper.url);
            setCropper(null);
          }}
          onDone={(file) => {
            const id = cropper.id;
            URL.revokeObjectURL(cropper.url);
            setCropper(null);
            void uploadFileToItem(id, file);
          }}
        />
      ) : null}

      {sourcePicker && (() => {
        const pickerItem = items.find((it) => it.id === sourcePicker);
        const hasImage = !!(pickerItem?.imageUrl || pickerItem?.localPreview);
        return (
          <div
            className="ig-source-sheet-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Choose image source"
            onClick={() => setSourcePicker(null)}
          >
            <div className="ig-source-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="ig-source-sheet-handle" />
              <p className="ig-source-sheet-title">
                {hasImage ? "Change image" : "Add image"}
              </p>
              <div className="ig-source-sheet-options">
                <button
                  type="button"
                  className="ig-source-option"
                  onClick={() => {
                    cameraInputRefs.current[sourcePicker]?.click();
                    setSourcePicker(null);
                  }}
                >
                  <span className="ig-source-option-icon">📷</span>
                  <span>Camera</span>
                </button>
                <button
                  type="button"
                  className="ig-source-option"
                  onClick={() => {
                    fileInputRefs.current[sourcePicker]?.click();
                    setSourcePicker(null);
                  }}
                >
                  <span className="ig-source-option-icon" aria-hidden><IconImages size={18} /></span>
                  <span>Gallery</span>
                </button>
                <button
                  type="button"
                  className="ig-source-option"
                  onClick={() => {
                    setUrlEditId(sourcePicker);
                    setSourcePicker(null);
                  }}
                >
                  <span className="ig-source-option-icon">🔗</span>
                  <span>Paste URL</span>
                </button>
              </div>
              <button
                type="button"
                className="ig-source-sheet-cancel"
                onClick={() => setSourcePicker(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {showPreview && (
        <div
          className="ig-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Post preview"
          onClick={() => setShowPreview(false)}
        >
          <div className="ig-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ig-preview-modal-head">
              <span className="ig-preview-modal-title">Feed Preview</span>
              <button
                type="button"
                className="ig-preview-close"
                aria-label="Close preview"
                onClick={() => setShowPreview(false)}
              >
                ✕
              </button>
            </div>
            <div className="ig-preview-card-wrap">
              <div style={{ pointerEvents: "none" }}>
                <FeedPostCard post={previewPost} voteMode="local" showPermalinkToolbar={false} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

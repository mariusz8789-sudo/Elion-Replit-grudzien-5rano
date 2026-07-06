import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Search, Plus, MapPin, DollarSign, Calendar } from "lucide-react";
import { format } from "date-fns";
import type { MarketplaceListing } from "@shared/schema";
import CreateListingDialog from "@/components/CreateListingDialog";

export default function MarketplacePage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: listings = [], isLoading } = useQuery<MarketplaceListing[]>({
    queryKey: ["/api/marketplace"],
    queryFn: async () => {
      const response = await fetch("/api/marketplace");
      if (!response.ok) throw new Error("Failed to fetch listings");
      return response.json();
    },
  });

  const categories = [
    { value: "all", label: "All Categories" },
    { value: "boxes", label: "Boxes & Packaging" },
    { value: "equipment", label: "Equipment Rental" },
    { value: "materials", label: "Moving Materials" },
    { value: "services", label: "Professional Services" },
    { value: "promotion", label: "Special Promotions" },
  ];

  const filteredListings = listings.filter((listing) => {
    const matchesSearch =
      listing.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (listing.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesCategory = categoryFilter === "all" || listing.category === categoryFilter;
    return matchesSearch && matchesCategory && listing.available;
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold font-[Outfit]">Marketplace</h1>
            <p className="text-muted-foreground mt-1">
              Moving materials, equipment & services
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-listing">
            <Plus className="w-4 h-4 mr-2" />
            Post Listing
          </Button>
        </div>

        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search listings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-marketplace"
              />
            </div>
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredListings.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No listings found</h3>
            <p className="text-muted-foreground">
              {searchQuery || categoryFilter !== "all"
                ? "Try adjusting your search filters"
                : "Be the first to post a listing"}
            </p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredListings.map((listing) => (
              <Card
                key={listing.id}
                className="overflow-hidden hover-elevate"
                data-testid={`card-listing-${listing.id}`}
              >
                {listing.images && listing.images.length > 0 && (
                  <div className="aspect-video bg-muted relative">
                    <img
                      src={listing.images[0]}
                      alt={listing.title}
                      className="w-full h-full object-cover"
                    />
                    {listing.featured && (
                      <Badge className="absolute top-2 right-2 bg-accent">Featured</Badge>
                    )}
                  </div>
                )}
                <div className="p-4 space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-lg line-clamp-1">{listing.title}</h3>
                      <Badge variant="outline" className="capitalize shrink-0">
                        {listing.type}
                      </Badge>
                    </div>
                    {listing.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {listing.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    {listing.price && (
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-accent" />
                        <span className="font-bold text-lg">${listing.price}</span>
                      </div>
                    )}
                    {listing.location && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span className="line-clamp-1">{listing.location}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{format(new Date(listing.createdAt), "MMM d")}</span>
                    </div>
                    <Button size="sm" variant="outline" data-testid={`button-contact-${listing.id}`}>
                      Contact
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateListingDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

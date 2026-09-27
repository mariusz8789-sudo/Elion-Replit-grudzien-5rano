import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertMarketplaceListingSchema } from "@shared/schema";
import ImageUpload from "./ImageUpload";

const formSchema = insertMarketplaceListingSchema.extend({
  price: z.string().optional(),
  location: z.string().optional(),
});

interface CreateListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateListingDialog({ open, onOpenChange }: CreateListingDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [images, setImages] = useState<string[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "product",
      title: "",
      description: "",
      category: "boxes",
      listingKind: "sale",
      price: "",
      location: undefined,
      condition: "new",
      available: true,
      images: [],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest("POST", "/api/marketplace", {
        ...data,
        price: data.price ? parseFloat(data.price) : undefined,
        images,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      toast({
        title: "Listing created!",
        description: "Your listing is now live in the marketplace.",
      });
      form.reset();
      setImages([]);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create listing",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    await createMutation.mutateAsync(data);
    setIsSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Marketplace Listing</DialogTitle>
          <DialogDescription>
            Post items, services, or promotions for the moving community
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value ?? undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-listing-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="product">Product</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                        <SelectItem value="promotion">Promotion</SelectItem>
                        <SelectItem value="material">Material</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value ?? undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-listing-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="boxes">Boxes & Packaging</SelectItem>
                        <SelectItem value="equipment">Equipment Rental</SelectItem>
                        <SelectItem value="materials">Moving Materials</SelectItem>
                        <SelectItem value="services">Professional Services</SelectItem>
                        <SelectItem value="promotion">Special Promotions</SelectItem>
                        <SelectItem value="plastic_crates">Reusable Plastic Crates</SelectItem>
                        <SelectItem value="packing_paper">Packing Paper</SelectItem>
                        <SelectItem value="recycled_wrap">Recycled Wrap</SelectItem>
                        <SelectItem value="moving_blankets">Moving Blankets</SelectItem>
                        <SelectItem value="dollies">Dollies</SelectItem>
                        <SelectItem value="lifting_straps">Lifting Straps</SelectItem>
                        <SelectItem value="storage_containers">Storage Containers</SelectItem>
                        <SelectItem value="warehouse_rental">Warehouse Rental</SelectItem>
                        <SelectItem value="cleaning_services">Cleaning Services</SelectItem>
                        <SelectItem value="disposal_services">Disposal Services</SelectItem>
                        <SelectItem value="recycling_services">Recycling Services</SelectItem>
                        <SelectItem value="furniture_reuse">Furniture Reuse</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="listingKind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Listing Kind</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value ?? "sale"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-listing-kind">
                          <SelectValue placeholder="Select kind" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sale">For Sale</SelectItem>
                        <SelectItem value="rental">For Rental</SelectItem>
                        <SelectItem value="donation">Donation</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Moving boxes - Large (10 pack)"
                      {...field}
                      data-testid="input-listing-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe your listing..."
                      {...field}
                      data-testid="input-listing-description"
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        data-testid="input-listing-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="condition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value ?? undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-listing-condition">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="like-new">Like New</SelectItem>
                        <SelectItem value="used">Used</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="City or ZIP"
                        value={field.value || ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        data-testid="input-listing-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>Images (Optional)</FormLabel>
              <ImageUpload
                images={images}
                onImagesChange={setImages}
                maxImages={5}
                category="marketplace"
              />
            </FormItem>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-listing"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="button-submit-listing"
              >
                {isSubmitting ? "Creating..." : "Create Listing"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

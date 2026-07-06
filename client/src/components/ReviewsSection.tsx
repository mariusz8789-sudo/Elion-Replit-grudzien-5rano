import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Star, User } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertReviewSchema } from "@shared/schema";
import type { Review } from "@shared/schema";
import { z } from "zod";

const formSchema = insertReviewSchema.extend({
  comment: z.string().optional(),
});

interface ReviewsSectionProps {
  companyId: string;
  bookingId?: string;
}

export default function ReviewsSection({ companyId, bookingId }: ReviewsSectionProps) {
  const [selectedRating, setSelectedRating] = useState(0);
  const { toast } = useToast();

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ["/api/companies", companyId, "/reviews"],
    queryFn: async () => {
      const response = await fetch(`/api/companies/${companyId}/reviews`);
      if (!response.ok) throw new Error("Failed to fetch reviews");
      return response.json();
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyId,
      rating: 0,
      comment: "",
      bookingId: bookingId || undefined,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest("POST", "/api/reviews", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "/reviews"] });
      toast({
        title: "Review submitted!",
        description: "Thank you for your feedback.",
      });
      form.reset();
      setSelectedRating(0);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit review",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createMutation.mutate({ ...data, rating: selectedRating });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Customer Reviews</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{avgRating.toFixed(1)}</span>
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-5 h-5 ${
                      star <= Math.round(avgRating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">({reviews.length} reviews)</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 border-t pt-4">
              <div>
                <FormLabel>Your Rating</FormLabel>
                <div className="flex gap-2 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setSelectedRating(star)}
                      className="focus:outline-none"
                      data-testid={`star-${star}`}
                    >
                      <Star
                        className={`w-8 h-8 transition-colors ${
                          star <= selectedRating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground hover:text-yellow-200"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Review (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Share your experience..."
                        {...field}
                        data-testid="textarea-review-comment"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={selectedRating === 0 || createMutation.isPending}
                data-testid="button-submit-review"
              >
                {createMutation.isPending ? "Submitting..." : "Submit Review"}
              </Button>
            </form>
          </Form>

          <div className="space-y-3 border-t pt-4">
            {reviews.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No reviews yet. Be the first to review!
              </p>
            ) : (
              reviews.map((review) => (
                <Card key={review.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${
                                  star <= review.rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-muted-foreground"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm font-medium">{review.rating}/5</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(review.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-muted-foreground mt-2">{review.comment}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

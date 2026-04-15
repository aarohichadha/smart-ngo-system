import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DollarSign, Heart } from "lucide-react";

type NgoProfile = {
  id: string;
  ngo_name: string;
  description: string | null;
  sector: string | null;
  location: string | null;
};

const DUMMY_NGOS: NgoProfile[] = [
  {
    id: "dummy-1",
    ngo_name: "Helping Hands Foundation",
    description: "Providing education and healthcare to underprivileged children",
    sector: "Education",
    location: "Mumbai, Maharashtra"
  },
  {
    id: "dummy-2",
    ngo_name: "Green Earth Initiative",
    description: "Environmental conservation and sustainable development",
    sector: "Environment",
    location: "Delhi, India"
  },
  {
    id: "dummy-3",
    ngo_name: "Women Empowerment Network",
    description: "Supporting women's rights and economic independence",
    sector: "Social Welfare",
    location: "Bangalore, Karnataka"
  },
  {
    id: "dummy-4",
    ngo_name: "Rural Development Trust",
    description: "Improving infrastructure and livelihood in rural areas",
    sector: "Rural Development",
    location: "Chennai, Tamil Nadu"
  }
];

export default function FundSupport() {
  const [searchParams] = useSearchParams();
  const [ngos, setNgos] = useState<NgoProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNgo, setSelectedNgo] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const fetchNgos = async () => {
      try {
        const { data, error } = await supabase
          .from('ngo_profiles')
          .select('id, ngo_name, description, sector, location')
          .eq('verification_status', 'verified');

        if (error) throw error;

        // Make it dynamic: only use dummy data if no verified NGOs exist
        if (data && data.length > 0) {
          setNgos(data as any as NgoProfile[]);
        } else {
          setNgos(DUMMY_NGOS);
        }
      } catch (error) {
        console.error('Error fetching NGOs:', error);
        toast.error("Failed to load NGOs from database. Using fallback data.");
        setNgos(DUMMY_NGOS);
      } finally {
        setLoading(false);
      }
    };

    fetchNgos();
  }, []);

  useEffect(() => {
    const help = searchParams.get("help") === "true";
    const helpNgoName = searchParams.get("ngoName");

    if (helpNgoName) {
      // Find ID if name matches or just let the user select
      const foundNgo = ngos.find(n => n.ngo_name.toLowerCase().includes(helpNgoName.toLowerCase()));
      if (foundNgo) {
        setSelectedNgo(foundNgo.id);
      }
    }

    if (help) {
      setAmount("500");
    }
  }, [searchParams, ngos]);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async (amountNum: number, currentNgoName: string) => {
    setIsProcessing(true);
    const res = await loadRazorpayScript();

    if (!res) {
      toast.error('Razorpay SDK failed to load. Are you online?');
      setIsProcessing(false);
      return;
    }

    const options = {
      // You should configure VITE_RAZORPAY_KEY_ID in your .env for a real test key
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_YOUR_KEY_HERE",
      amount: Math.round(amountNum * 100).toString(), // Razorpay expects amount in paise
      currency: "INR",
      name: "Fund Support",
      description: `Donation to ${currentNgoName}`,
      image: "https://your-logo-url.com/logo.png",
      handler: function (response: any) {
        toast.success(`Payment successful! Payment ID: ${response.razorpay_payment_id}`);
        setSelectedNgo("");
        setAmount("");
        setIsProcessing(false);
      },
      prefill: {
        name: "Generous Donor",
        email: "donor@example.com",
        contact: "9999999999"
      },
      notes: {
        ngoId: selectedNgo,
        ngoName: currentNgoName
      },
      theme: {
        color: "#dc2626" // Tailwind red-600
      },
      modal: {
        ondismiss: function () {
          setIsProcessing(false);
        }
      }
    };

    // @ts-ignore
    const paymentObject = new window.Razorpay(options);
    
    paymentObject.on('payment.failed', function (response: any) {
      toast.error(`Payment failed: ${response.error.description}`);
      setIsProcessing(false);
    });

    paymentObject.open();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedNgo || !amount) {
      toast.error("Please fill in all fields");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const currentNgoName = ngos.find((ngo) => ngo.id === selectedNgo)?.ngo_name || "the selected NGO";
    
    if (!import.meta.env.VITE_RAZORPAY_KEY_ID) {
      toast.info("No Razorpay Key configured. Using dummy testing key which may cause errors.");
    }

    await handlePayment(amountNum, currentNgoName);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  const selectedNgoData = ngos.find(ngo => ngo.id === selectedNgo);

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Heart className="w-10 h-10 text-red-500 fill-red-500/20" />
          <h1 className="text-4xl font-extrabold tracking-tight">Fund Support</h1>
        </div>

        <Card className="shadow-lg border-muted">
          <CardHeader className="bg-muted/30 border-b pb-6">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <DollarSign className="w-6 h-6 text-green-600" />
              Make a Donation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="ngo" className="text-base font-semibold">Select NGO</Label>
                <Select value={selectedNgo} onValueChange={setSelectedNgo}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Choose an NGO to support" />
                  </SelectTrigger>
                  <SelectContent>
                    {ngos.map((ngo) => (
                      <SelectItem key={ngo.id} value={ngo.id} className="py-3">
                        <span className="font-medium text-base">{ngo.ngo_name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedNgoData && (
                  <div className="mt-2 p-3 bg-muted/50 rounded-md border border-muted flex flex-col gap-1">
                    {selectedNgoData.description && (
                      <p className="text-sm text-muted-foreground">{selectedNgoData.description}</p>
                    )}
                    {selectedNgoData.location && (
                      <p className="text-xs font-semibold text-primary/80 flex items-center gap-1 mt-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-map-pin"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 15.006 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
                        {selectedNgoData.location}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label htmlFor="amount" className="text-base font-semibold">Donation Amount (₹)</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-muted-foreground font-semibold">₹</span>
                  </div>
                  <Input
                    id="amount"
                    type="number"
                    step="1"
                    min="1"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-8 h-12 text-lg font-medium"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-14 text-lg font-bold tracking-wide mt-4"
                disabled={isProcessing}
              >
                {isProcessing ? "Processing..." : "Donate with Razorpay"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {ngos.length === 0 && (
          <Card className="mt-6 border-dashed">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground font-medium">
                No verified NGOs available at the moment.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
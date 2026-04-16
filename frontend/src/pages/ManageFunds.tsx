import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, DollarSign, Edit } from "lucide-react";
import { toast } from "sonner";

const fundRequests = [
  { id: "fr1", title: "Emergency school supplies", amount: 50000, status: "Open" },
  { id: "fr2", title: "Community health camp", amount: 75000, status: "Approved" },
];

const donationRecords = [
  { id: "dr1", donor: "Anita Sharma", amount: 1500, method: "UPI", date: "2026-03-25" },
  { id: "dr2", donor: "Rahul Gupta", amount: 2500, method: "Credit Card", date: "2026-03-27" },
  { id: "dr3", donor: "Priya Menon", amount: 1200, method: "PayPal", date: "2026-03-29" },
];

export default function ManageFunds() {
  const [bankDetails, setBankDetails] = useState({
    bankName: "State Bank of India",
    accountName: "Sahayak NGO Trust",
    accountNumber: "987654321012",
    ifsc: "SBIN0009876",
    branch: "Marine Lines Branch",
    upiId: "sahayakngo@sbi",
  });

  const [editBankDetails, setEditBankDetails] = useState({
    bankName: "",
    accountName: "",
    accountNumber: "",
    ifsc: "",
    branch: "",
    upiId: "",
  });

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleEditBankDetails = () => {
    setEditBankDetails({ ...bankDetails });
    setIsEditDialogOpen(true);
  };

  const handleSaveBankDetails = () => {
    // Validate required fields
    if (!editBankDetails.accountName || !editBankDetails.accountNumber || !editBankDetails.ifsc) {
      toast.error("Please fill in all required fields");
      return;
    }

    setBankDetails({ ...editBankDetails });
    setIsEditDialogOpen(false);
    toast.success("Bank details updated successfully");
  };
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <DollarSign className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Manage Funds</h1>
          <p className="text-sm text-muted-foreground">Track fund requests, donations, and payout details.</p>
        </div>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total donations</p>
                <p className="text-3xl font-bold mt-2">Rs 5,200</p>
              </div>
              <Banknote className="w-6 h-6 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Bank details for receiving funds</CardTitle>
              <Button variant="outline" size="sm" onClick={handleEditBankDetails}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Account name</p>
                <p className="font-medium text-foreground">{bankDetails.accountName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Account number</p>
                <p className="font-medium text-foreground">{bankDetails.accountNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bank name</p>
                <p className="font-medium text-foreground">{bankDetails.bankName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">IFSC</p>
                <p className="font-medium text-foreground">{bankDetails.ifsc}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Branch</p>
                <p className="font-medium text-foreground">{bankDetails.branch}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">UPI ID</p>
                <p className="font-medium text-foreground">{bankDetails.upiId}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Bank Details</DialogTitle>
              <DialogDescription>
                Update your bank details for receiving donations. All fields marked with * are required.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="accountName">Account Name *</Label>
                <Input
                  id="accountName"
                  value={editBankDetails.accountName}
                  onChange={(e) => setEditBankDetails({ ...editBankDetails, accountName: e.target.value })}
                  placeholder="Enter account holder name"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="accountNumber">Account Number *</Label>
                <Input
                  id="accountNumber"
                  value={editBankDetails.accountNumber}
                  onChange={(e) => setEditBankDetails({ ...editBankDetails, accountNumber: e.target.value })}
                  placeholder="Enter account number"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  value={editBankDetails.bankName}
                  onChange={(e) => setEditBankDetails({ ...editBankDetails, bankName: e.target.value })}
                  placeholder="Enter bank name"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ifsc">IFSC Code *</Label>
                <Input
                  id="ifsc"
                  value={editBankDetails.ifsc}
                  onChange={(e) => setEditBankDetails({ ...editBankDetails, ifsc: e.target.value })}
                  placeholder="Enter IFSC code"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={editBankDetails.branch}
                  onChange={(e) => setEditBankDetails({ ...editBankDetails, branch: e.target.value })}
                  placeholder="Enter branch name"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="upiId">UPI ID</Label>
                <Input
                  id="upiId"
                  value={editBankDetails.upiId}
                  onChange={(e) => setEditBankDetails({ ...editBankDetails, upiId: e.target.value })}
                  placeholder="Enter UPI ID (e.g., example@upi)"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveBankDetails}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current fund requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {fundRequests.map((request) => (
                <div key={request.id} className="rounded-lg border border-border p-4">
                  <p className="font-medium">{request.title}</p>
                  <p className="text-sm text-muted-foreground">Rs {request.amount}</p>
                  <p className="text-xs uppercase tracking-wide mt-2 text-muted-foreground">{request.status}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent donations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Donor</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {donationRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3">{record.donor}</td>
                    <td className="px-4 py-3">Rs {record.amount}</td>
                    <td className="px-4 py-3">{record.method}</td>
                    <td className="px-4 py-3">{record.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

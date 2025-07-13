import express from "express";
import partyValidators from "../validators/parties.js";
import partyViewControllers from "../controllers/parties/party-view-controller.js";
import partyController from "../controllers/parties/party-controller.js";

const router = express.Router();

router.get("/", (_req, res) => {
  res.redirect("/party/new");
});

router.get("/party/new", partyViewControllers.renderNewPartyPage);
router.get("/party", partyViewControllers.renderPartyStatusPage);
router.post(
  "/party",
  partyValidators.createPartyValidator,
  partyController.createParty,
);
router.patch("/party/check-in", partyController.checkInParty);
router.delete("/party", partyController.deleteParty);
router.get("/party/events", partyController.streamPartyEvents);

export default router;

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import nodemailer from 'nodemailer'
import { prisma } from "../../lib/prisma";
import { dayjs } from "../../lib/dayjs";
import { getMailClient } from "../../lib/mail";
import { ClientError } from "../../errors/client-errors";
import { env } from "../../env";

export async function createInvite(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/trips/:tripId/invites",
    {
      schema: {
        params: z.object({
          tripId: z.string().uuid(),
        }),
        body: z.object({
          email: z.string().email(),
        }),
      },
    },
    async (request) => {
      const { tripId } = request.params;
      const { email } = request.body;

      const trip = await prisma.trip.findUnique({
        where: { id: tripId },
      });

      if (!trip) {
        throw new ClientError("Trip not found");
      }

      // Verifica se o email já está registrado como participante da viagem
      const existingParticipant = await prisma.participant.findFirst({
        where: {
          trip_id: tripId,
          email,
        },
      });

      if (existingParticipant) {
        throw new ClientError("Este email já foi convidado para esta viagem.");
      }

      const participant = await prisma.participant.create({
        data: {
          name: "",
          email,
          trip_id: tripId,
        },
      });

      const formattedStartDate = dayjs(trip.starts_at).format("LL");
      const formattedEndDate = dayjs(trip.ends_at).format("LL");

      const mail = await getMailClient();

      const confirmationLink = `${env.API_BASE_URL}/participants/${participant.id}/confirm`;
      const message = await mail.sendMail({
        from: {
          name: "Equipe plann.er",
          address: "oi@plann.er",
        },
        to: participant.email,
        subject: `Confirme sua presença na viagem para ${trip.destination}`,
        html: `
            <div style="font-family: sans-serif; font-size: 16px; line-height:1.6">
                <p>Você foi convidado(a) para participar de uma viagem para <strong>${trip.destination}</strong> nas datas de <strong>${formattedStartDate}</strong> até <strong>${formattedEndDate}</strong>.</p>
                <br>
                <p>Para confirmar sua presença na viagem, clique no link abaixo:</p>
                <br>
                <p>
                    <a href="${confirmationLink}">Confirmar viagem</a>
                </p>
                <br>
                <p>Caso você não saiba do que se trata esse e-mail, apenas ignore-o.</p>
            </div>`.trim(),
      });

      console.log(nodemailer.getTestMessageUrl(message));

      return {
        participantId: participant.id,
      };
    }
  );
}

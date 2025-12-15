import nodemailer from 'nodemailer'
export const transport = nodemailer.createTransport({
    service: 'gmail',
    auth:{
        user:process.env.NODE_CODE_SENDING_EMAIL_ADDRESS,
        pass:process.env.NODE_CODE_SENDING_EMAIL_ADDRESS_PASSWORD
    } 
})
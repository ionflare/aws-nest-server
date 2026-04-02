import { Controller, Get } from "@nestjs/common";

@Controller('auth')
export class AuthController {
    constructor() { }

    @Get('me')
    me() {
        const dm = {
            a : "aaa"
        };
        return dm;
    }
}
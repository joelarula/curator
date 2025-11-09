"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnTenantArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantCreateManyInput_1 = require("../../../inputs/TenantCreateManyInput");
let CreateManyAndReturnTenantArgs = class CreateManyAndReturnTenantArgs {
};
exports.CreateManyAndReturnTenantArgs = CreateManyAndReturnTenantArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [TenantCreateManyInput_1.TenantCreateManyInput], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], CreateManyAndReturnTenantArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Boolean, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Boolean)
], CreateManyAndReturnTenantArgs.prototype, "skipDuplicates", void 0);
exports.CreateManyAndReturnTenantArgs = CreateManyAndReturnTenantArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateManyAndReturnTenantArgs);

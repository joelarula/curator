"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyModelArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelCreateManyInput_1 = require("../../../inputs/ModelCreateManyInput");
let CreateManyModelArgs = class CreateManyModelArgs {
};
exports.CreateManyModelArgs = CreateManyModelArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelCreateManyInput_1.ModelCreateManyInput], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], CreateManyModelArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Boolean, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Boolean)
], CreateManyModelArgs.prototype, "skipDuplicates", void 0);
exports.CreateManyModelArgs = CreateManyModelArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateManyModelArgs);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOneModelArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelCreateInput_1 = require("../../../inputs/ModelCreateInput");
let CreateOneModelArgs = class CreateOneModelArgs {
};
exports.CreateOneModelArgs = CreateOneModelArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCreateInput_1.ModelCreateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelCreateInput_1.ModelCreateInput)
], CreateOneModelArgs.prototype, "data", void 0);
exports.CreateOneModelArgs = CreateOneModelArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateOneModelArgs);
